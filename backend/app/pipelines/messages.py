"""Pipeline de respuestas de mensajería de MercadoLibre.

Flujo: clasificar la pregunta -> buscar inventario (si es catálogo) ->
componer la respuesta -> auditar -> responder a Meli (autopilot) o guardar
sugerencia. El orquestador `process_incoming` nunca levanta: cualquier fallo
deja el mensaje en `needs_human` y notifica al negocio.

Reglas de oro (AGENTS.md):
- Scoping por business: el inventario y los prompts se filtran siempre por el
  business dueño de la cuenta.
- POST a Meli sin reintento: `send_reply` usa `_meli_request`, que ya hace
  single-attempt para POST (crear duplicado es peor que fallar).
- Mensajes de error en español, best-effort para notificaciones.
"""
import json
import re
from decimal import Decimal

from app.db.helpers import execute, get_all, get_one, insert_and_get_id
from app.integrations.core.credentials import get_access_token
from app.integrations.mercadolibre.product_handler import _meli_request
from app.service.llm_api import call_deepseek_api
from app.settings.config import SCHEMA_ACCOUNTS, SCHEMA_AI, SCHEMA_INVENTORY, SCHEMA_MERCADOLIBRE
from app.utils.logger import logger

MESSAGES_TABLE = SCHEMA_MERCADOLIBRE + ".messages"
REPLIES_TABLE = SCHEMA_MERCADOLIBRE + ".replies"
PROMPTS_TABLE = SCHEMA_AI + ".prompts"
ACCOUNTS_TABLE = SCHEMA_ACCOUNTS + ".accounts"
PRODUCTS_TABLE = SCHEMA_INVENTORY + ".products"
LISTINGS_TABLE = SCHEMA_MERCADOLIBRE + ".product_listings"

MELI_BASE_URL = "https://api.mercadolibre.com"

DEFAULT_MESSAGE_PROMPTS = {
    "ai_message_general": (
        "Sos el asistente de atención al cliente de Omnipanel para un vendedor de "
        "e-commerce en Argentina. Respondé siempre en español rioplatense, de forma "
        "concisa y amable. No inventes datos que no estén en el contexto."
    ),
    "ai_message_rules": (
        "Nunca prometas envíos gratis salvo que esté configurado. No des precios, "
        "stock ni plazos que no estén en el contexto. Si la pregunta es un reclamo, "
        "devolución, mediación, pide datos personales o no se puede responder con la "
        "información disponible, respondé NEEDS_HUMAN. No ofrezcas descuentos ni "
        "cambios de precio."
    ),
    "ai_message_intent": (
        'Clasificá la pregunta del comprador. Devolvé SOLO un JSON válido sin '
        'comentarios: {"type": "simple|catalog|complaint", "query": "..."} donde '
        'query solo se incluye si type es catalog y es la búsqueda en lenguaje '
        'natural del producto sobre el inventario (ej: "campera negra talle L").'
    ),
    "ai_message_reply": (
        "Respondé la pregunta del comprador como si fueras el vendedor, usando SOLO "
        "los datos del contexto (producto, candidatos de inventario, orden, reglas). "
        "Devolvé SOLO el texto de la respuesta. Si no podés responder con esos datos "
        "o corresponde a un humano, devolvé exactamente NEEDS_HUMAN."
    ),
    "ai_message_auditor": (
        'Auditá la respuesta propuesta contra el contexto y las reglas. Devolvé SOLO '
        'un JSON válido sin comentarios: {"verdict": "pass|fix|fail", "score": 0.0, '
        '"issues": ["..."], "fixed_text": "..."}. Objetá cualquier dato (precio, '
        'stock, producto, plazo) que no esté en el contexto, promesas que el negocio '
        'no pueda cumplir y tono inadecuado. Si la corregís, devolvé la versión '
        'corregida en fixed_text.'
    ),
    "ai_message_improve_human_reply": (
        "Mejorá la redacción de la respuesta del vendedor manteniendo el sentido "
        "original. Corregí ortografía, hacela clara y amable, y conservá los datos "
        "concretos (precios, plazos, stock)."
    ),
}

MESSAGE_PROMPT_KEYS = tuple(DEFAULT_MESSAGE_PROMPTS.keys())


def _json_default(obj):
    """Serializa Decimal (precios desde MySQL) como float para json.dumps."""
    if isinstance(obj, Decimal):
        return float(obj)
    return str(obj)


def _dumps(obj):
    return json.dumps(obj, ensure_ascii=False, default=_json_default)

DEFAULT_REPLY_MODE = "suggest"
DEFAULT_REPLY_MIN_CONFIDENCE = 0.70
DEFAULT_REPLY_AUDIT_ENABLED = 1


# ─── Settings ──────────────────────────────────────────────────────────────────

def load_message_settings(business_id):
    """Prompts + settings de respuestas del negocio (ai.prompts, una fila por business).

    Devuelve {"prompts": {...}, "reply_mode", "reply_min_confidence",
    "reply_audit_enabled"} con fallback a defaults cuando no hay fila o un campo
    viene NULL/empty.
    """
    try:
        row = get_one("SELECT * FROM " + PROMPTS_TABLE + " WHERE business_id = :b",
                      {"b": business_id})
    except LookupError:
        row = {}

    prompts = {}
    for key in MESSAGE_PROMPT_KEYS:
        value = (row or {}).get(key)
        prompts[key] = value if value else DEFAULT_MESSAGE_PROMPTS[key]

    reply_mode = (row or {}).get("reply_mode") or DEFAULT_REPLY_MODE
    raw_confidence = (row or {}).get("reply_min_confidence")
    if raw_confidence is None:
        reply_min_confidence = DEFAULT_REPLY_MIN_CONFIDENCE
    else:
        reply_min_confidence = float(raw_confidence)
    raw_audit = (row or {}).get("reply_audit_enabled")
    reply_audit_enabled = raw_audit if raw_audit is not None else DEFAULT_REPLY_AUDIT_ENABLED

    return {
        "prompts": prompts,
        "reply_mode": reply_mode,
        "reply_min_confidence": reply_min_confidence,
        "reply_audit_enabled": reply_audit_enabled,
    }


# ─── Paso 1: clasificar ────────────────────────────────────────────────────────

def _clean_json_fences(text):
    """Quita fences ```json ... ``` y basura alrededor de un JSON."""
    if not isinstance(text, str):
        return text
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        return m.group(1)
    # Tolerancia: primer { ... último }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start:end + 1]
    return text


def classify_question(business_id, text):
    """Clasifica la pregunta en simple|catalog|complaint (+ query para catálogo)."""
    prompts = load_message_settings(business_id)["prompts"]
    raw = call_deepseek_api(prompts["ai_message_intent"], {"pregunta": text})
    try:
        parsed = json.loads(_clean_json_fences(raw))
    except (TypeError, ValueError):
        parsed = {}
    if not isinstance(parsed, dict):
        parsed = {}
    intent_type = str(parsed.get("type") or "simple").lower().strip()
    if intent_type not in ("simple", "catalog", "complaint"):
        intent_type = "simple"
    query = parsed.get("query") if intent_type == "catalog" else None
    return {"type": intent_type, "query": query}


# ─── Paso 2: búsqueda de inventario ────────────────────────────────────────────

def _inventory_rows(account_id, business_id, like_clause, params):
    sql = (
        "SELECT p.id, p.name, p.sku, p.brand, p.model, p.price, p.stock,"
        " pl.meli_id, pl.permalink"
        " FROM " + PRODUCTS_TABLE + " p"
        " JOIN " + LISTINGS_TABLE + " pl ON pl.product_id = p.id"
        " WHERE p.business_id = :b AND pl.account_id = :a"
        " AND pl.status = 'active' AND p.stock > 0"
        " AND (" + like_clause + ")"
        " LIMIT 5"
    )
    params = dict(params, b=business_id, a=account_id)
    return get_all(sql, params)


def inventory_search(account_id, business_id, query):
    """Top 5 productos activos del inventario del business que matchean `query`.

    Nunca cruza businesses: el JOIN con product_listings está filtrado por
    account_id y el products por business_id.
    """
    query = (query or "").strip()
    if not query:
        return []

    q = "%" + query + "%"
    like_clause = ("p.name LIKE :q OR p.sku LIKE :q OR p.brand LIKE :q"
                   " OR p.model LIKE :q OR p.description LIKE :q")
    rows = _inventory_rows(account_id, business_id, like_clause, {"q": q})

    if len(rows) < 3:
        tokens = [t for t in re.split(r"\s+", query) if len(t) >= 2]
        if tokens:
            clauses = []
            params = {}
            for i, token in enumerate(tokens):
                key = "t%d" % i
                params[key] = "%" + token + "%"
                clauses.append(
                    "(p.name LIKE :{k} OR p.sku LIKE :{k} OR p.brand LIKE :{k}"
                    " OR p.model LIKE :{k} OR p.description LIKE :{k})".format(k=key))
            token_rows = _inventory_rows(account_id, business_id,
                                         " OR ".join(clauses), params)
            seen = {(r["id"]) for r in rows}
            for r in token_rows:
                if r["id"] not in seen:
                    rows.append(r)
                    seen.add(r["id"])
                if len(rows) >= 5:
                    break
    return rows


# ─── Paso 3: contexto del producto ─────────────────────────────────────────────

def product_context(message):
    """Datos del producto asociado al mensaje (item_id) o None."""
    item_id = message.get("item_id")
    account_id = message.get("account_id")
    if not item_id or not account_id:
        return None
    try:
        row = get_one(
            "SELECT p.name, p.price, p.stock, pl.status AS listing_status"
            " FROM " + LISTINGS_TABLE + " pl"
            " LEFT JOIN " + PRODUCTS_TABLE + " p ON p.id = pl.product_id"
            " WHERE pl.meli_id = :item_id AND pl.account_id = :account_id",
            {"item_id": str(item_id), "account_id": account_id})
    except LookupError:
        return None
    return {
        "name": row.get("name"),
        "price": row.get("price"),
        "stock": row.get("stock"),
        "listing_status": row.get("listing_status"),
    }


# ─── Paso 4/5: componer y auditar ──────────────────────────────────────────────

def compose_reply(business_id, question, context):
    prompts = load_message_settings(business_id)["prompts"]
    return call_deepseek_api(prompts["ai_message_reply"],
                             {"pregunta": question, "contexto": _dumps(context)})


def audit_reply(business_id, question, draft, context):
    prompts = load_message_settings(business_id)["prompts"]
    raw = call_deepseek_api(prompts["ai_message_auditor"], {
        "pregunta": question,
        "respuesta": draft,
        "contexto": _dumps(context),
    })
    try:
        parsed = json.loads(_clean_json_fences(raw))
        if not isinstance(parsed, dict):
            raise ValueError("auditoría no es un objeto")
        verdict = str(parsed.get("verdict") or "fail").lower().strip()
        if verdict not in ("pass", "fix", "fail"):
            verdict = "fail"
        score = parsed.get("score")
        try:
            score = float(score) if score is not None else 0.0
        except (TypeError, ValueError):
            score = 0.0
        issues = parsed.get("issues") if isinstance(parsed.get("issues"), list) else []
        fixed_text = parsed.get("fixed_text")
        return {"verdict": verdict, "score": score, "issues": issues,
                "fixed_text": fixed_text}
    except (TypeError, ValueError):
        return {"verdict": "fail", "score": 0, "issues": ["auditoría inválida"],
                "fixed_text": None}


# ─── Paso 6: enviar respuesta a Meli ───────────────────────────────────────────

def _pack_id_from_data(data):
    """pack_id del mensaje: data.pack_id o message_resources[name == 'packs'].id."""
    if not isinstance(data, dict):
        return None
    if data.get("pack_id"):
        return str(data["pack_id"])
    messages = data.get("messages") or []
    if messages:
        first = messages[0] if isinstance(messages[0], dict) else {}
        for resource in (first.get("message_resources") or []):
            if isinstance(resource, dict) and resource.get("name") == "packs":
                return resource.get("id")
    return None


def send_reply(account_id, message, text):
    """Envía la respuesta a Meli. Devuelve el id externo de la respuesta creada.

    question -> POST /marketplace/answers; message -> POST
    /marketplace/messages/packs/{pack_id}. `_meli_request` no reintenta POST.
    Las excepciones se propagan al caller (que decide needs_human).
    """
    token = get_access_token(account_id).get("access_token")
    kind = message.get("kind")

    if kind == "question":
        url = MELI_BASE_URL + "/marketplace/answers"
        json_body = {"question_id": str(message.get("external_id")), "text": text}
        response = _meli_request("POST", url, token, json_body=json_body, timeout=30)
        response.raise_for_status()
        payload = response.json() or {}
        return payload.get("id")

    # kind == "message"
    try:
        raw_data = message.get("data")
        data = json.loads(raw_data) if isinstance(raw_data, str) else (raw_data or {})
    except (TypeError, ValueError):
        data = {}
    pack_id = _pack_id_from_data(data)
    if not pack_id:
        raise ValueError("no pack_id en el mensaje")
    url = MELI_BASE_URL + "/marketplace/messages/packs/" + str(pack_id)
    response = _meli_request("POST", url, token,
                             json_body={"text": text, "attachments": []}, timeout=30)
    response.raise_for_status()
    payload = response.json() or {}
    return payload.get("id")


# ─── Notificación al negocio ───────────────────────────────────────────────────

def notify_pending(message_row, reason):
    """Avisa al negocio que hay una consulta sin responder. Nunca levanta."""
    try:
        import app.service.notifications as notifications

        business_id = get_one(
            "SELECT business_id FROM " + ACCOUNTS_TABLE + " WHERE id = :a",
            {"a": message_row["account_id"]})["business_id"]
        ctx = product_context(message_row) or {}
        notifications.notify_business(business_id, "message_needs_review", {
            "platform": "mercadolibre",
            "buyer_name": message_row.get("buyer_name"),
            "product_title": ctx.get("name"),
            "snippet": message_row.get("last_text"),
            "reason": reason,
            "message_id": message_row["id"],
        })
    except Exception:
        logger.exception("notify_pending failed for message %s", message_row.get("id"))
    try:
        execute("UPDATE " + MESSAGES_TABLE + " SET last_notified_at = NOW() WHERE id = :id",
                {"id": message_row["id"]})
    except Exception:
        logger.exception("Could not set last_notified_at for message %s",
                         message_row.get("id"))


# ─── Orquestador ───────────────────────────────────────────────────────────────

def _message_text(message):
    text = message.get("last_text")
    if text:
        return text.strip()
    try:
        raw_data = message.get("data")
        data = json.loads(raw_data) if isinstance(raw_data, str) else (raw_data or {})
    except (TypeError, ValueError):
        data = {}
    if message.get("kind") == "question":
        return ((data.get("question") or {}).get("text") or "").strip()
    msgs = data.get("messages") or []
    if msgs:
        return (msgs[-1].get("text") or "").strip()
    return (data.get("text") or "").strip()


def _needs_human(message, reason):
    execute(
        "UPDATE " + MESSAGES_TABLE
        + " SET reply_status = 'needs_human', needs_human_reason = :reason"
        + " WHERE id = :id",
        {"reason": reason, "id": message["id"]})
    notify_pending(message, reason)


def _mark_needs_human_if_unset(message_id, reason):
    """Para el except global: solo pisa si el mensaje aún no fue procesado."""
    try:
        row = get_one("SELECT id, reply_status, account_id, buyer_name, last_text,"
                      " item_id FROM " + MESSAGES_TABLE + " WHERE id = :id",
                      {"id": message_id})
    except LookupError:
        return
    if row.get("reply_status") is None:
        _needs_human(row, reason)


def process_incoming(message_id):
    """Orquesta el pipeline completo. Nunca levanta; devuelve el resultado."""
    try:
        return _process(message_id)
    except Exception:
        logger.exception("process_incoming failed for message %s", message_id)
        reason = "Error inesperado en el pipeline de IA"
        _mark_needs_human_if_unset(message_id, reason)
        return {"reply": None, "audit": None, "needs_human_reason": reason}


def _process(message_id):
    try:
        message = get_one("SELECT * FROM " + MESSAGES_TABLE + " WHERE id = :id",
                          {"id": message_id})
    except LookupError:
        logger.warning("process_incoming: message %s not found", message_id)
        return {"reply": None, "audit": None, "needs_human_reason": None}

    if message.get("reply_status") is not None:
        logger.info("Message %s already processed (%s); skipping",
                    message_id, message["reply_status"])
        return {"reply": None, "audit": None, "needs_human_reason": None}

    business_id = get_one(
        "SELECT business_id FROM " + ACCOUNTS_TABLE + " WHERE id = :a",
        {"a": message["account_id"]})["business_id"]

    settings = load_message_settings(business_id)
    if settings["reply_mode"] == "off":
        logger.info("Message %s: AI reply mode off", message_id)
        execute("UPDATE " + MESSAGES_TABLE + " SET reply_status = 'unanswered' WHERE id = :id",
                {"id": message_id})
        notify_pending(message, "modo de IA apagado")
        return {"reply": None, "audit": None, "needs_human_reason": "modo de IA apagado"}

    question_text = _message_text(message)
    if not question_text:
        logger.info("Message %s: no question text, skipping", message_id)
        return {"reply": None, "audit": None, "needs_human_reason": None}

    intent = classify_question(business_id, question_text)
    if intent["type"] == "complaint":
        reason = "Posible reclamo o devolución — requiere respuesta humana"
        _needs_human(message, reason)
        return {"reply": None, "audit": None, "needs_human_reason": reason}

    candidates = (inventory_search(message["account_id"], business_id, intent.get("query") or "")
                  if intent["type"] == "catalog" else [])
    context = {
        "producto": product_context(message),
        "candidatos": candidates,
    }

    draft = compose_reply(business_id, question_text, context)
    draft = (draft or "").strip()
    if draft.upper().startswith("NEEDS_HUMAN"):
        reason = "La IA no pudo responder con la información disponible"
        _needs_human(message, reason)
        return {"reply": None, "audit": None, "needs_human_reason": reason}

    # Auditoría (opcional según settings).
    audit = None
    attempt_no = 1
    if settings["reply_audit_enabled"]:
        audit = audit_reply(business_id, question_text, draft, context)
        if audit["verdict"] == "fix":
            retry_ctx = dict(context)
            retry_ctx["objecciones_auditor"] = (
                "Objecciones del auditor: " + "; ".join(audit.get("issues") or [])
                + " / Corrección sugerida: " + (audit.get("fixed_text") or ""))
            draft2 = compose_reply(business_id, question_text, retry_ctx)
            audit2 = audit_reply(business_id, question_text, draft2, context)
            attempt_no = 2
            draft = (draft2 or "").strip()
            audit = audit2
        if audit["verdict"] in ("fail", "fix"):
            reason = "La auditoría de IA rechazó la respuesta"
            _needs_human(message, reason)
            return {"reply": None, "audit": None, "needs_human_reason": reason}

    if audit is not None and audit.get("score") is not None:
        confidence = float(audit["score"])
    else:
        confidence = 0.8

    audit_pass = (audit is None) or audit["verdict"] == "pass"
    is_autopilot = (settings["reply_mode"] == "autopilot"
                    and audit_pass
                    and confidence >= settings["reply_min_confidence"])
    mode = "autopilot" if is_autopilot else "suggested"
    status = "sending" if is_autopilot else "suggested"

    audit_issues = (audit.get("issues") or []) if audit else []
    reply_id = insert_and_get_id(
        "INSERT INTO " + REPLIES_TABLE
        + " (account_id, message_id, author, mode, text, ai_confidence, attempt_no,"
        + " context_used, used_inventory_search, audit_verdict, audit_score,"
        + " audit_issues, status)"
        + " VALUES (:account_id, :message_id, 'ai', :mode, :text, :ai_confidence,"
        + " :attempt_no, :context_used, :used_inventory_search, :audit_verdict,"
        + " :audit_score, :audit_issues, :status)",
        {
            "account_id": message["account_id"],
            "message_id": message["id"],
            "mode": mode,
            "text": draft,
            "ai_confidence": confidence,
            "attempt_no": attempt_no,
            "context_used": _dumps(context),
            "used_inventory_search": 1 if (intent["type"] == "catalog") else 0,
            "audit_verdict": audit["verdict"] if audit else None,
            "audit_score": audit["score"] if audit else None,
            "audit_issues": json.dumps(audit_issues, ensure_ascii=False) if audit_issues else None,
            "status": status,
        })

    reply = get_one("SELECT * FROM " + REPLIES_TABLE + " WHERE id = :id",
                    {"id": reply_id})

    audit_out = ({"verdict": audit["verdict"], "score": audit["score"],
                  "issues": audit.get("issues")} if audit else None)

    if is_autopilot:
        try:
            external_id = send_reply(message["account_id"], message, draft)
        except Exception as exc:
            logger.exception("Autopilot send failed for message %s", message_id)
            execute("UPDATE " + REPLIES_TABLE
                    + " SET status = 'failed', error = :error WHERE id = :id",
                    {"error": str(exc), "id": reply_id})
            reason = "No se pudo enviar la respuesta: " + str(exc)
            _needs_human(message, reason)
            reply = get_one("SELECT * FROM " + REPLIES_TABLE + " WHERE id = :id",
                            {"id": reply_id})
            return {"reply": reply, "audit": audit_out, "needs_human_reason": reason}

        execute("UPDATE " + REPLIES_TABLE
                + " SET status = 'sent', external_reply_id = :ext WHERE id = :id",
                {"ext": external_id, "id": reply_id})
        execute("UPDATE " + MESSAGES_TABLE
                + " SET reply_status = 'answered', ai_confidence = :conf,"
                + " handled_at = NOW(), last_outgoing_at = NOW() WHERE id = :id",
                {"conf": confidence, "id": message_id})
        reply = get_one("SELECT * FROM " + REPLIES_TABLE + " WHERE id = :id",
                        {"id": reply_id})
        return {"reply": reply, "audit": audit_out, "needs_human_reason": None}

    # suggest
    execute("UPDATE " + MESSAGES_TABLE
            + " SET reply_status = 'ai_suggested', ai_confidence = :conf WHERE id = :id",
            {"conf": confidence, "id": message_id})
    return {"reply": reply, "audit": audit_out, "needs_human_reason": None}


def force_ai_suggest(message_id, actor_role=None):
    """Fuerza una sugerencia desde el dashboard (POST /ai-suggest).

    Descarta sugerencias previas (draft/suggested), resetea el estado del mensaje
    y vuelve a correr el pipeline. Devuelve lo mismo que `process_incoming`.
    """
    logger.info("force_ai_suggest message=%s actor_role=%s", message_id, actor_role)
    try:
        get_one("SELECT id FROM " + MESSAGES_TABLE + " WHERE id = :id",
                {"id": message_id})
    except LookupError:
        return {"reply": None, "audit": None, "needs_human_reason": "not_found"}

    execute("UPDATE " + REPLIES_TABLE
            + " SET status = 'discarded' WHERE message_id = :id AND status IN ('draft','suggested')",
            {"id": message_id})
    execute("UPDATE " + MESSAGES_TABLE
            + " SET reply_status = NULL, needs_human_reason = NULL, ai_confidence = NULL"
            + " WHERE id = :id",
            {"id": message_id})
    return process_incoming(message_id)
