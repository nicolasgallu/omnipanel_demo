"""REST API de administración: empleados, prompts de IA, settings y costos de
venta de MercadoLibre (mercadolibre.selling_costs)."""
import json

from flask import Blueprint, g, jsonify, request

from app.api.auth_utils import current_business_id, current_user, require_auth, require_business
from app.api.inventory import _owned_product, _serializable
from app.db.helpers import execute, get_all, get_one
from app.settings.config import SCHEMA_ACCOUNTS, SCHEMA_AI
from app.utils.logger import logger

admin_bp = Blueprint("admin_api", __name__, url_prefix="/api")

EMPLOYEES_TABLE = SCHEMA_ACCOUNTS + ".employees"
BUSINESSES_TABLE = SCHEMA_ACCOUNTS + ".businesses"
PROMPTS_TABLE = SCHEMA_AI + ".prompts"

GCS_BUCKET = "pictures_ecommerce_guiaslocales"
MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2 MB
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


# ─── Empleados ────────────────────────────────────────────────────────────────

@admin_bp.route("/employees", methods=["GET"])
@require_auth
@require_business
def list_employees():
    rows = get_all(
        "SELECT id, full_name, email, active, created_at FROM " + EMPLOYEES_TABLE
        + " WHERE business_id = :b ORDER BY created_at DESC, id DESC",
        {"b": current_business_id()})
    return jsonify({"items": [{
        "id": r["id"],
        "full_name": r.get("full_name"),
        "email": r.get("email"),
        "active": bool(r.get("active")),
        "created_at": _serializable(r.get("created_at")),
    } for r in rows]})


@admin_bp.route("/employees", methods=["POST"])
@require_auth
@require_business
def create_employee():
    data = request.get_json(silent=True) or {}
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not full_name or len(password) < 6:
        return jsonify({"error": "bad_request",
                        "message": "Nombre y contraseña (mín. 6) son obligatorios"}), 400
    if "@" not in email or "." not in email:
        return jsonify({"error": "bad_request", "message": "Email inválido"}), 400

    try:
        get_one("SELECT id FROM " + EMPLOYEES_TABLE
                + " WHERE business_id = :b AND email = :email",
                {"b": current_business_id(), "email": email})
        return jsonify({"error": "duplicate_email",
                        "message": "Ya existe un usuario con ese email"}), 409
    except LookupError:
        pass

    # La contraseña se guarda en texto plano (misma convención que el login
    # legacy); el hash de werkzeug también es soportado al verificar.
    execute(
        "INSERT INTO " + EMPLOYEES_TABLE
        + " (business_id, email, password, full_name, active)"
        + " VALUES (:b, :email, :password, :full_name, 1)",
        {"b": current_business_id(), "email": email,
         "password": password, "full_name": full_name})
    row = get_one("SELECT LAST_INSERT_ID() AS id")
    logger.info("Employee created by %s: %s", current_user().get("email"), email)
    return jsonify({"id": row["id"]}), 201


@admin_bp.route("/employees/<int:employee_id>", methods=["PATCH"])
@require_auth
@require_business
def patch_employee(employee_id):
    data = request.get_json(silent=True) or {}
    if "active" not in data:
        return jsonify({"error": "bad_request", "message": "Falta el campo active"}), 400
    active = 1 if data.get("active") else 0
    rowcount = execute(
        "UPDATE " + EMPLOYEES_TABLE + " SET active = :active"
        + " WHERE id = :id AND business_id = :b",
        {"active": active, "id": employee_id, "b": current_business_id()})
    if not rowcount:
        return jsonify({"error": "not_found", "message": "Usuario no encontrado"}), 404
    return jsonify({"id": employee_id, "active": bool(active)})


# ─── Prompts de IA (ai.prompts) ───────────────────────────────────────────────

# Keys que ve el front (contrato Figma) -> columna real en ai.prompts.
PROMPT_KEYS = [
    "ai_generate_title", "ai_generate_description", "ai_generate_brand",
    "ai_generate_model",
    "cs_tone", "cs_rules", "cs_classifier", "cs_writer", "cs_auditor",
    "ai_improving_human_reply",
]
PROMPT_ALIASES = {
    "cs_tone": "ai_message_general",
    "cs_rules": "ai_message_rules",
    "cs_classifier": "ai_message_intent",
    "cs_writer": "ai_message_reply",
    "cs_auditor": "ai_message_auditor",
    "ai_improving_human_reply": "ai_message_improve_human_reply",
}

# Settings de respuestas de mensajería (columnas de ai.prompts). El front habla
# en {mode, min_confidence 0-100, audit}; la DB guarda min_confidence 0-1.
PROMPT_SETTING_KEYS = ("reply_mode", "reply_min_confidence", "reply_audit_enabled")
DEFAULT_PROMPT_SETTINGS = {
    "reply_mode": "suggest",
    "reply_min_confidence": 0.75,
    "reply_audit_enabled": 1,
}


def _prompt_settings(row):
    """Settings de respuestas en el vocabulario del front (0-100, bool)."""
    out = {}
    for k in PROMPT_SETTING_KEYS:
        val = row.get(k) if row else None
        if val is None:
            val = DEFAULT_PROMPT_SETTINGS[k]
        out[k] = val
    return {
        "mode": out["reply_mode"],
        "min_confidence": int(round(float(out["reply_min_confidence"]) * 100)),
        "audit": bool(out["reply_audit_enabled"]),
    }


def _validate_prompt_settings(settings):
    """Valida body {"settings": {...}} del PUT. Devuelve columnas o ValueError."""
    if settings is None:
        return {}
    if not isinstance(settings, dict):
        raise ValueError("settings debe ser un objeto")
    out = {}
    if "mode" in settings:
        mode = settings.get("mode")
        if mode not in ("off", "suggest", "autopilot"):
            raise ValueError("mode debe ser off, suggest o autopilot")
        out["reply_mode"] = mode
    if "min_confidence" in settings:
        val = settings.get("min_confidence")
        try:
            val = int(val)
        except (TypeError, ValueError):
            raise ValueError("min_confidence debe ser un número entero")
        if not 0 <= val <= 100:
            raise ValueError("min_confidence debe estar entre 0 y 100")
        out["reply_min_confidence"] = val / 100.0
    if "audit" in settings:
        val = settings.get("audit")
        if not isinstance(val, bool):
            raise ValueError("audit debe ser true o false")
        out["reply_audit_enabled"] = 1 if val else 0
    return out


@admin_bp.route("/ai/prompts", methods=["GET"])
@require_auth
def get_prompts():
    """Prompts del negocio (una fila por business en ai.prompts)."""
    try:
        row = get_one("SELECT * FROM " + PROMPTS_TABLE
                      + " WHERE business_id = :b",
                      {"b": current_business_id()})
    except LookupError:
        return jsonify({"prompts": {}, "settings": _prompt_settings(None),
                        "supported": PROMPT_KEYS, "message":
                        "Sin prompts guardados para tu negocio"}), 200
    prompts = {k: row.get(PROMPT_ALIASES.get(k, k)) for k in PROMPT_KEYS}
    return jsonify({"prompts": prompts, "settings": _prompt_settings(row),
                    "supported": PROMPT_KEYS})


@admin_bp.route("/ai/prompts", methods=["PUT"])
@require_auth
def put_prompts():
    data = request.get_json(silent=True) or {}
    prompts = data.get("prompts") or {}
    updates = {PROMPT_ALIASES.get(k, k): v
               for k, v in prompts.items()
               if k in PROMPT_KEYS and isinstance(v, str)}

    settings_payload = data.get("settings")
    if settings_payload is not None:
        # Solo el dueño (business) cambia la configuración de IA.
        user = g.get("user") or {}
        if user.get("role") != "business":
            return jsonify({"error": "forbidden",
                            "message": "Solo el dueño del negocio puede cambiar "
                                       "la configuración de IA."}), 403
        try:
            updates.update(_validate_prompt_settings(settings_payload))
        except ValueError as exc:
            return jsonify({"error": "bad_request", "message": str(exc)}), 400

    business_id = current_business_id()

    try:
        row = get_one("SELECT id FROM " + PROMPTS_TABLE
                      + " WHERE business_id = :b", {"b": business_id})
    except LookupError:
        execute("INSERT INTO " + PROMPTS_TABLE + " (business_id) VALUES (:b)",
                {"b": business_id})
        row = get_one("SELECT id FROM " + PROMPTS_TABLE
                      + " WHERE business_id = :b", {"b": business_id})

    fields = ", ".join(k + " = :" + k for k in updates)
    if fields:
        params = dict(updates, id=row["id"])
        execute("UPDATE " + PROMPTS_TABLE + " SET " + fields
                + " WHERE id = :id", params)

    saved = get_one("SELECT * FROM " + PROMPTS_TABLE + " WHERE id = :id",
                    {"id": row["id"]})
    return jsonify({"prompts": {k: saved.get(PROMPT_ALIASES.get(k, k)) for k in PROMPT_KEYS},
                    "settings": _prompt_settings(saved),
                    "supported": PROMPT_KEYS})


# ─── Settings (config del negocio) ────────────────────────────────────────────

def _business_config():
    row = get_one("SELECT config, email, full_name FROM " + BUSINESSES_TABLE
                  + " WHERE id = :b", {"b": current_business_id()})
    raw = row.get("config")
    try:
        config = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        config = {}
    return row, config


@admin_bp.route("/settings", methods=["GET"])
@require_auth
@require_business
def get_settings():
    row, config = _business_config()
    return jsonify({
        "email": row.get("email"),
        "full_name": row.get("full_name"),
        "logo_url": config.get("logo_url"),
    })


@admin_bp.route("/settings/logo", methods=["POST"])
@require_auth
@require_business
def upload_logo():
    file = request.files.get("file")
    if file is None:
        return jsonify({"error": "missing_file", "message": "Falta el archivo"}), 400
    raw = file.read()
    if len(raw) > MAX_LOGO_BYTES:
        return jsonify({"error": "too_large",
                        "message": "Imagen demasiado grande (máx 2 MB)"}), 400
    if raw[:8] != PNG_MAGIC:
        return jsonify({"error": "invalid_format",
                        "message": "Solo se aceptan imágenes PNG"}), 400

    from google.cloud import storage
    client = storage.Client()
    blob = client.bucket(GCS_BUCKET).blob(
        "logos/business_{}.png".format(current_business_id()))
    blob.upload_from_string(raw, content_type="image/png")

    row, config = _business_config()
    config["logo_url"] = blob.public_url
    execute("UPDATE " + BUSINESSES_TABLE + " SET config = :config WHERE id = :b",
            {"config": json.dumps(config, ensure_ascii=False),
             "b": current_business_id()})
    return jsonify({"logo_url": blob.public_url})


# ─── Scrapfly (token del negocio, businesses.config) ───────────────────────────

@admin_bp.route("/settings/scrapfly", methods=["GET"])
@require_auth
@require_business
def get_scrapfly():
    _, config = _business_config()
    return jsonify({"api_key": config.get("scrapfly_api_key")})


@admin_bp.route("/settings/scrapfly", methods=["PUT"])
@require_auth
@require_business
def put_scrapfly():
    data = request.get_json(silent=True) or {}
    api_key = (data.get("api_key") or "").strip()
    if not api_key:
        return jsonify({"error": "bad_request",
                        "message": "El token de Scrapfly es obligatorio"}), 400

    _, config = _business_config()
    config["scrapfly_api_key"] = api_key
    execute("UPDATE " + BUSINESSES_TABLE + " SET config = :config WHERE id = :b",
            {"config": json.dumps(config, ensure_ascii=False),
             "b": current_business_id()})
    logger.info("Scrapfly token updated for business %s", current_business_id())
    return jsonify({"status": "ok"})


# ─── IMS (sistemas de inventario, businesses.config.stock_sync) ────────────────

IMS_PROVIDERS = ("bitcram", "none")
IMS_REQUIRED_FIELDS = {
    "bitcram": ("base_url", "checkout_number", "token", "payment_type"),
}


def _ims_payload():
    """Valida el body del form IMS. Devuelve (provider, config, error) donde
    error es (json_response, status) o None."""
    data = request.get_json(silent=True) or {}
    provider = str(data.get("provider") or "none").strip()
    if provider not in IMS_PROVIDERS:
        return None, None, (jsonify(
            {"error": "bad_request",
             "message": "Sistema de inventario desconocido: " + provider}), 400)
    cfg = data.get("config") or {}
    if not isinstance(cfg, dict):
        return None, None, (jsonify(
            {"error": "bad_request", "message": "config debe ser un objeto"}), 400)
    if provider == "bitcram":
        missing = [f for f in IMS_REQUIRED_FIELDS["bitcram"]
                   if not str(cfg.get(f) or "").strip()]
        if missing:
            return None, None, (jsonify(
                {"error": "bad_request",
                 "message": "Faltan campos obligatorios: " + ", ".join(missing)}), 400)
        # Normalización (misma que el cliente de Bitcram).
        cfg["base_url"] = str(cfg["base_url"]).strip().rstrip("/")
        cfg["iva_condition"] = str(cfg.get("iva_condition") or "CF").strip() or "CF"
    return provider, cfg, None


@admin_bp.route("/settings/stock-sync", methods=["GET"])
@require_auth
@require_business
def get_stock_sync():
    _, config = _business_config()
    ss = config.get("stock_sync") or {}
    return jsonify({
        "provider": ss.get("provider", "none"),
        "config": ss.get("config") or {},
    })


@admin_bp.route("/settings/stock-sync", methods=["POST"])
@require_auth
@require_business
def put_stock_sync():
    provider, cfg, err = _ims_payload()
    if err is not None:
        return err
    _, config = _business_config()
    config["stock_sync"] = {"provider": provider, "config": cfg}
    execute("UPDATE " + BUSINESSES_TABLE + " SET config = :config WHERE id = :b",
            {"config": json.dumps(config, ensure_ascii=False),
             "b": current_business_id()})
    logger.info("IMS stock_sync updated for business %s: provider=%s",
                current_business_id(), provider)
    return jsonify({"status": "ok"})


@admin_bp.route("/settings/stock-sync/test", methods=["POST"])
@require_auth
@require_business
def test_stock_sync():
    provider, cfg, err = _ims_payload()
    if err is not None:
        return err
    if provider == "none":
        return jsonify({"ok": False, "message": "No hay sistema configurado"})
    from app.integrations.bitcram.client import BitcramError, test_connection
    try:
        test_connection(cfg)
        return jsonify({"ok": True, "message": "Conexión correcta"})
    except BitcramError as exc:
        return jsonify({"ok": False, "message": str(exc)})
    except Exception as exc:
        logger.exception("IMS connection test failed for business %s",
                         current_business_id())
        return jsonify({"ok": False,
                        "message": "No se pudo conectar: %s" % str(exc)})


# ─── Costos de venta ML (mercadolibre.selling_costs) ──────────────────────────

@admin_bp.route("/mercadolibre/selling-costs", methods=["GET"])
@require_auth
def ml_selling_costs():
    product_id = request.args.get("product_id", type=int)
    account_id = request.args.get("account_id", type=int)
    if _owned_product(product_id) is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404

    try:
        listing = get_one(
            "SELECT id FROM mercadolibre.product_listings WHERE product_id = :p",
            {"p": product_id})
        row = get_one(
            "SELECT price, sale_fee_amount, sale_fixed_fee, financing_add_on_fee,"
            " meli_percentage_fee, percentage_fee, gross_amount, listing_fixed_fee,"
            " fee_tax, ship_list_cost, total_selling_cost, total_selling_cost_with_tax,"
            " created_at"
            " FROM mercadolibre.selling_costs WHERE product_listing_id = :lid",
            {"lid": listing["id"]})
    except LookupError:
        return jsonify({"costs": None})

    return jsonify({"costs": {
        "price": _serializable(row.get("price")),
        "sale_fee_amount": _serializable(row.get("sale_fee_amount")),
        "sale_fixed_fee": _serializable(row.get("sale_fixed_fee")),
        "financing_add_on_fee": _serializable(row.get("financing_add_on_fee")),
        "meli_percentage_fee": _serializable(row.get("meli_percentage_fee")),
        "percentage_fee": _serializable(row.get("percentage_fee")),
        "gross_amount": _serializable(row.get("gross_amount")),
        "listing_fixed_fee": _serializable(row.get("listing_fixed_fee")),
        "fee_tax": _serializable(row.get("fee_tax")),
        "ship_list_cost": _serializable(row.get("ship_list_cost")),
        "total_selling_cost": _serializable(row.get("total_selling_cost")),
        "total_selling_cost_with_tax": _serializable(row.get("total_selling_cost_with_tax")),
        "created_at": _serializable(row.get("created_at")),
    }})
