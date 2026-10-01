"""REST API de mensajería de MercadoLibre (bandeja de consultas) — contrato Figma.

Endpoints bajo /api/mercadolibre/messages, auth por token itsdangerous. Los
empleados tienen acceso (sin @require_business). Toda consulta/acción valida
ownership por business (`_owned_message`).

Vocabulario expuesto al front (la DB guarda los valores internos):
- kind: "question" | "post_sale"        (DB: question | message)
- reply_status: "new" | "ai_suggested" | "needs_review" | "answered" | "closed"
                (DB: unanswered | ai_suggested | needs_human | answered | closed)
Errores: {"error": "<código>", "message": "<texto español>"} con códigos HTTP
400/403/404/409/502 según el contrato del front.
"""
import json

from flask import Blueprint, jsonify, request

from app.api.auth_utils import current_business_id, current_user, require_auth
from app.db.helpers import execute, get_all, get_one, insert_and_get_id
from app.pipelines import messages as msg_pipeline
from app.service.llm_api import call_deepseek_api
from app.utils.logger import logger

messages_api_bp = Blueprint("messages_api", __name__, url_prefix="/api/mercadolibre/messages")

MESSAGES_TABLE = "mercadolibre.messages"
REPLIES_TABLE = "mercadolibre.replies"

KIND_API_TO_DB = {"question": "question", "post_sale": "message"}
KIND_DB_TO_API = {"question": "question", "message": "post_sale"}
STATUS_API_TO_DB = {
    "new": "unanswered",
    "ai_suggested": "ai_suggested",
    "needs_review": "needs_human",
    "answered": "answered",
    "closed": "closed",
}
STATUS_DB_TO_API = {v: k for k, v in STATUS_API_TO_DB.items()}
ALL_STATUSES_API = ["new", "ai_suggested", "needs_review", "answered", "closed"]

ML_QUESTION_URL = "https://www.mercadolibre.com.ar/preguntas/vendedor?item={item}&question={question}"
ML_MESSAGE_URL = "https://www.mercadolibre.com.ar/mensajes/{pack}"

PIPELINE_UNEXPECTED = "Error inesperado en el pipeline de IA"


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _owned_message(message_id):
    """Mensaje del business autenticado, o None si no existe / no es suyo."""
    try:
        return get_one(
            "SELECT m.*, a.business_id FROM " + MESSAGES_TABLE + " m"
            " JOIN platform_accounts.accounts a ON a.id = m.account_id"
            " WHERE m.id = :id AND a.business_id = :b",
            {"id": message_id, "b": current_business_id()})
    except LookupError:
        return None


def _iso(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _json_load(value):
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


def _pack_id(message):
    """pack_id del mensaje post-venta (message_resources -> packs)."""
    data = _json_load(message.get("data")) or {}
    if data.get("pack_id"):
        return str(data["pack_id"])
    for m in data.get("messages") or []:
        for res in m.get("message_resources") or []:
            if res.get("name") == "packs":
                return str(res.get("id"))
    return None


def _ml_url(message):
    if message.get("kind") == "question":
        return ML_QUESTION_URL.format(item=message.get("item_id") or "",
                                      question=message.get("external_id") or "")
    return ML_MESSAGE_URL.format(pack=_pack_id(message) or message.get("external_id") or "")


def _closed_reason(message):
    """Texto legible del motivo de cierre según el status de Meli."""
    status = str(message.get("status") or "")
    if status == "DELETED":
        return "MercadoLibre eliminó esta pregunta."
    if status == "CLOSED_UNANSWERED":
        return "MercadoLibre cerró la pregunta sin respuesta."
    if status in ("BANNED", "DISABLED"):
        return "La pregunta fue deshabilitada por MercadoLibre."
    return "La conversación está cerrada en MercadoLibre."


def _listing_status(db_status):
    if db_status == "active":
        return "published"
    if db_status in ("paused", "under_review"):
        return "paused"
    if isinstance(db_status, str) and db_status.lower().startswith("failed"):
        return "failed"
    if db_status == "closed":
        return "unpublished"
    return "unpublished"


def _product_detail(message):
    item_id = message.get("item_id")
    account_id = message.get("account_id")
    if not item_id or not account_id:
        return None
    try:
        row = get_one(
            "SELECT p.id AS product_id, p.name, p.price, p.stock, pl.permalink,"
            " pl.status AS listing_status"
            " FROM mercadolibre.product_listings pl"
            " LEFT JOIN inventory.products p ON p.id = pl.product_id"
            " WHERE pl.meli_id = :item_id AND pl.account_id = :account_id",
            {"item_id": str(item_id), "account_id": account_id})
    except LookupError:
        return None
    return {
        "product_id": row.get("product_id"),
        "title": row.get("name") or "",
        "price": float(row.get("price") or 0),
        "stock": int(row.get("stock") or 0),
        "permalink": row.get("permalink"),
        "listing_status": _listing_status(row.get("listing_status")),
    }


def _cited_products(row):
    ctx = _json_load(row.get("context_used")) or {}
    candidates = ctx.get("candidatos") or []
    out = []
    for c in candidates:
        if not isinstance(c, dict):
            continue
        out.append({
            "title": c.get("name") or c.get("title") or "",
            "price": float(c.get("price") or 0),
            "stock": int(c.get("stock") or 0),
        })
    return out


def _audit_verdict_api(verdict):
    if verdict == "pass":
        return "approved"
    if verdict == "fix":
        return "corrected"
    return None


def _serialize_reply(row):
    """Reply en el shape MsgReply del contrato Figma."""
    db_status = row.get("status")
    status = "sent" if db_status == "sent" else ("failed" if db_status == "failed" else "draft")
    return {
        "id": row["id"],
        "author": "seller",
        "mode": "ai" if row.get("author") == "ai" else "human",
        "text": row.get("text"),
        "status": status,
        "audit_verdict": _audit_verdict_api(row.get("audit_verdict")),
        "audit_score": float(row["audit_score"]) if row.get("audit_score") is not None else None,
        "audit_issues": _json_load(row.get("audit_issues")) or [],
        "created_at": _iso(row.get("created_at")),
        "cited_products": _cited_products(row),
    }


def _serialize_item(row, product_title="", last_reply_mode=None):
    db_status = row.get("reply_status") or "unanswered"
    return {
        "id": str(row["id"]),
        "kind": KIND_DB_TO_API.get(row.get("kind"), row.get("kind")),
        "buyer_name": row.get("buyer_name"),
        "product_title": product_title or "",
        "last_text": row.get("last_text"),
        "reply_status": STATUS_DB_TO_API.get(db_status, db_status),
        "assigned_to": str(row["assigned_to"]) if row.get("assigned_to") else None,
        "ai_confidence": float(row["ai_confidence"]) if row.get("ai_confidence") is not None else None,
        "created_at": _iso(row.get("created_at")),
        "last_activity": _iso(row.get("last_outgoing_at") or row.get("updated_at")),
        "listing_id": str(row.get("item_id")) if row.get("item_id") else None,
        "last_reply_mode": last_reply_mode,
        "ml_url": _ml_url(row),
    }


def _last_reply_modes(message_ids):
    """{message_id: 'ai'|'human'} del último reply no descartado por mensaje."""
    if not message_ids:
        return {}
    placeholders = ", ".join(":m{}".format(i) for i in range(len(message_ids)))
    params = {"m{}".format(i): mid for i, mid in enumerate(message_ids)}
    rows = get_all(
        "SELECT r.message_id, r.author FROM " + REPLIES_TABLE + " r"
        + " JOIN (SELECT message_id, MAX(id) AS mid FROM " + REPLIES_TABLE
        + " WHERE message_id IN (" + placeholders + ")"
        + " AND status <> 'discarded' GROUP BY message_id) t ON t.mid = r.id",
        params)
    return {r["message_id"]: ("ai" if r["author"] == "ai" else "human") for r in rows}


def _not_found():
    return jsonify({"error": "not_found",
                    "message": "No encontramos esta conversación."}), 404


def _closed_response():
    return jsonify({"error": "closed",
                    "message": "La conversación está cerrada en MercadoLibre."}), 409


def _already_answered_response():
    return jsonify({"error": "already_answered",
                    "message": "Esta pregunta ya se respondió desde MercadoLibre."}), 409


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@messages_api_bp.route("", methods=["GET"])
@require_auth
def list_messages():
    kind_api = request.args.get("kind")
    kind_db = KIND_API_TO_DB.get(kind_api) if kind_api else None
    statuses_api = [s for s in (request.args.get("reply_status") or "").split(",") if s]
    statuses_db = [STATUS_API_TO_DB.get(s) for s in statuses_api if s in STATUS_API_TO_DB]
    q = (request.args.get("q") or "").strip()
    page = max(1, request.args.get("page", default=1, type=int) or 1)
    page_size = max(1, min(request.args.get("page_size", default=50, type=int) or 50, 200))
    offset = (page - 1) * page_size

    where = ["a.business_id = :b"]
    params = {"b": current_business_id()}
    if kind_db:
        where.append("m.kind = :kind")
        params["kind"] = kind_db
    if statuses_db:
        where.append("m.reply_status IN ({})".format(
            ", ".join(":rs{}".format(i) for i in range(len(statuses_db)))))
        for i, s in enumerate(statuses_db):
            params["rs{}".format(i)] = s
    if q:
        where.append("(m.buyer_name LIKE :q OR m.last_text LIKE :q OR p.name LIKE :q)")
        params["q"] = "%" + q + "%"

    base_from = (
        " FROM " + MESSAGES_TABLE + " m"
        " JOIN platform_accounts.accounts a ON a.id = m.account_id"
        " LEFT JOIN mercadolibre.product_listings pl"
        "   ON pl.meli_id = m.item_id AND pl.account_id = m.account_id"
        " LEFT JOIN inventory.products p ON p.id = pl.product_id")
    where_sql = " WHERE " + " AND ".join(where)

    total = get_one("SELECT COUNT(*) AS c" + base_from + where_sql, params)["c"]
    rows = get_all(
        "SELECT m.id, m.kind, m.external_id, m.item_id, m.buyer_name, m.last_text,"
        " m.reply_status, m.assigned_to, m.ai_confidence, m.created_at, m.updated_at,"
        " m.last_outgoing_at, m.data, COALESCE(p.name, '') AS product_title"
        + base_from + where_sql
        + " ORDER BY COALESCE(m.last_outgoing_at, m.updated_at) DESC"
        + " LIMIT :limit OFFSET :offset",
        dict(params, limit=page_size, offset=offset))

    modes = _last_reply_modes([r["id"] for r in rows])
    items = [_serialize_item(r, r.get("product_title"), modes.get(r["id"])) for r in rows]

    # Counts por kind de TODO el business (sin q/status/page).
    counts = {k: {"total": 0, **{s: 0 for s in ALL_STATUSES_API}}
              for k in ("question", "post_sale")}
    count_rows = get_all(
        "SELECT m.kind, m.reply_status, COUNT(*) AS c" + base_from
        + " WHERE a.business_id = :b GROUP BY m.kind, m.reply_status",
        {"b": current_business_id()})
    for cr in count_rows:
        kind_api = KIND_DB_TO_API.get(cr["kind"])
        status_api = STATUS_DB_TO_API.get(cr["reply_status"] or "unanswered")
        if kind_api in counts:
            counts[kind_api]["total"] += cr["c"]
            if status_api in counts[kind_api]:
                counts[kind_api][status_api] = cr["c"]

    return jsonify({"items": items, "page": page, "page_size": page_size,
                    "total": total, "counts": counts})


@messages_api_bp.route("/<int:message_id>", methods=["GET"])
@require_auth
def get_message(message_id):
    message = _owned_message(message_id)
    if message is None:
        return _not_found()

    reply_rows = get_all(
        "SELECT * FROM " + REPLIES_TABLE
        + " WHERE message_id = :id AND status <> 'discarded' ORDER BY id",
        {"id": message_id})

    product = _product_detail(message)
    db_status = message.get("reply_status")

    sent_count = get_one(
        "SELECT COUNT(*) AS c FROM " + REPLIES_TABLE
        + " WHERE message_id = :id AND status = 'sent'",
        {"id": message_id})["c"]
    answered_externally = db_status == "answered" and sent_count == 0

    needs_review = db_status == "needs_human"
    reason = message.get("needs_human_reason")

    message_api = _serialize_item(message, (product or {}).get("title") or "")
    message_api.update({
        "product_id": (product or {}).get("product_id"),
        "answered_externally": bool(answered_externally),
        "closed_reason": _closed_reason(message) if db_status == "closed" else None,
        "review_reason": reason if needs_review else None,
        "ai_error": reason if needs_review else None,
    })

    replies = [{
        "id": None,
        "author": "buyer",
        "mode": None,
        "text": message.get("last_text"),
        "status": "received",
        "audit_verdict": None,
        "audit_score": None,
        "audit_issues": [],
        "created_at": _iso(message.get("created_at")),
        "cited_products": None,
    }] + [_serialize_reply(r) for r in reply_rows]

    return jsonify({
        "message": message_api,
        "replies": replies,
        "product": {
            "title": (product or {}).get("title") or "",
            "price": (product or {}).get("price") or 0,
            "stock": (product or {}).get("stock") or 0,
            "listing_status": (product or {}).get("listing_status") or "unpublished",
        },
    })


@messages_api_bp.route("/<int:message_id>/ai-suggest", methods=["POST"])
@require_auth
def ai_suggest(message_id):
    message = _owned_message(message_id)
    if message is None:
        return _not_found()
    if message.get("reply_status") == "closed":
        return _closed_response()
    if message.get("reply_status") == "answered":
        return _already_answered_response()

    result = msg_pipeline.force_ai_suggest(message_id,
                                           actor_role=current_user().get("role"))
    reply = result.get("reply")
    if reply:
        audit = result.get("audit") or {}
        verdict = _audit_verdict_api(audit.get("verdict")) or "approved"
        score = audit.get("score")
        if score is None:
            score = reply.get("ai_confidence") or 0.8
        return jsonify({
            "reply": _serialize_reply(reply),
            "audit": {
                "verdict": verdict,
                "score": float(score),
                "issues": audit.get("issues") or [],
            },
        }), 200

    reason = result.get("needs_human_reason") or "La IA no pudo responder"
    if reason == PIPELINE_UNEXPECTED:
        return jsonify({"error": "ai_unavailable",
                        "message": "El servicio de IA no respondió. Volvé a intentar en unos segundos."}), 502
    return jsonify({"error": "needs_human",
                    "message": "La IA no pudo responder: " + str(reason)}), 400


@messages_api_bp.route("/<int:message_id>/improve", methods=["POST"])
@require_auth
def improve(message_id):
    message = _owned_message(message_id)
    if message is None:
        return _not_found()
    data = request.get_json(silent=True) or {}
    text = data.get("text")
    if not isinstance(text, str) or not text.strip():
        return jsonify({"error": "empty",
                        "message": "Escribí algo para que la IA lo pueda mejorar."}), 400

    prompts = msg_pipeline.load_message_settings(current_business_id())["prompts"]
    try:
        improved = call_deepseek_api(prompts["ai_message_improve_human_reply"],
                                     {"texto": text, "pregunta": message.get("last_text")})
    except Exception as exc:
        logger.exception("AI improve failed for message %s", message_id)
        return jsonify({"error": "ai_unavailable",
                        "message": "No se pudo mejorar el texto con IA: " + str(exc)}), 502
    return jsonify({"text": str(improved or "").strip()})


@messages_api_bp.route("/<int:message_id>/reply", methods=["POST"])
@require_auth
def reply_manual(message_id):
    message = _owned_message(message_id)
    if message is None:
        return _not_found()
    data = request.get_json(silent=True) or {}
    text = data.get("text")
    if not isinstance(text, str) or not text.strip():
        return jsonify({"error": "empty",
                        "message": "La respuesta está vacía."}), 400
    if len(text) > 2000:
        return jsonify({"error": "too_long",
                        "message": "MercadoLibre acepta hasta 2000 caracteres por respuesta."}), 400
    if message.get("reply_status") == "closed":
        return _closed_response()
    if message.get("reply_status") == "answered":
        return _already_answered_response()

    # Si el texto coincide con el borrador sugerido, se envía ESE reply (queda
    # como respuesta "IA aprobada por humano"); si no, reply manual nuevo.
    reply = None
    try:
        draft = get_one(
            "SELECT * FROM " + REPLIES_TABLE
            + " WHERE message_id = :id AND status IN ('draft','suggested')"
            + " ORDER BY id DESC LIMIT 1",
            {"id": message_id})
        if (draft.get("text") or "").strip() == text.strip():
            reply = draft
    except LookupError:
        pass

    if reply is None:
        reply_id = insert_and_get_id(
            "INSERT INTO " + REPLIES_TABLE
            + " (account_id, message_id, author, mode, text, attempt_no, status)"
            + " VALUES (:account_id, :message_id, 'user', 'manual', :text, 1, 'sending')",
            {"account_id": message["account_id"], "message_id": message_id, "text": text})
        reply = get_one("SELECT * FROM " + REPLIES_TABLE + " WHERE id = :id",
                        {"id": reply_id})
    else:
        execute("UPDATE " + REPLIES_TABLE + " SET status = 'sending' WHERE id = :id",
                {"id": reply["id"]})

    try:
        external_id = msg_pipeline.send_reply(message["account_id"], message, text)
    except Exception as exc:
        logger.exception("Manual reply send failed for message %s", message_id)
        execute("UPDATE " + REPLIES_TABLE + " SET status = 'failed', error = :error WHERE id = :id",
                {"error": str(exc), "id": reply["id"]})
        reason = "No se pudo enviar la respuesta: " + str(exc)
        execute("UPDATE " + MESSAGES_TABLE
                + " SET reply_status = 'needs_human', needs_human_reason = :reason WHERE id = :id",
                {"reason": reason, "id": message_id})
        msg_pipeline.notify_pending(message, reason)
        return jsonify({"error": "ml_unavailable",
                        "message": "MercadoLibre no respondió. Tu respuesta no se envió: " + str(exc)}), 502

    execute("UPDATE " + REPLIES_TABLE
            + " SET status = 'sent', external_reply_id = :ext WHERE id = :id",
            {"ext": external_id, "id": reply["id"]})
    execute("UPDATE " + MESSAGES_TABLE
            + " SET reply_status = 'answered', handled_at = NOW(), last_outgoing_at = NOW()"
            + " WHERE id = :id",
            {"id": message_id})
    reply = get_one("SELECT * FROM " + REPLIES_TABLE + " WHERE id = :id",
                    {"id": reply["id"]})
    return jsonify({"reply": _serialize_reply(reply)}), 200


@messages_api_bp.route("/<int:message_id>/discard-suggestion", methods=["POST"])
@require_auth
def discard_suggestion(message_id):
    message = _owned_message(message_id)
    if message is None:
        return _not_found()
    execute("UPDATE " + REPLIES_TABLE
            + " SET status = 'discarded' WHERE message_id = :id AND status IN ('draft','suggested')",
            {"id": message_id})
    execute("UPDATE " + MESSAGES_TABLE
            + " SET reply_status = 'unanswered' WHERE id = :id AND reply_status = 'ai_suggested'",
            {"id": message_id})
    return jsonify({"ok": True})


@messages_api_bp.route("/<int:message_id>/assign", methods=["POST"])
@require_auth
def assign(message_id):
    message = _owned_message(message_id)
    if message is None:
        return _not_found()
    user_id = current_user().get("id")
    current = message.get("assigned_to")
    new_value = None if current == user_id else user_id
    execute("UPDATE " + MESSAGES_TABLE + " SET assigned_to = :u WHERE id = :id",
            {"u": new_value, "id": message_id})
    return jsonify({"assigned_to": str(new_value) if new_value else None})
