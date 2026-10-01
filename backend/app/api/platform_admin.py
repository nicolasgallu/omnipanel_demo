"""Panel de plataforma (/api/platform): admins gestionan businesses y cuentas.

- Admins: tabla platform_accounts.admins, login con token propio (salt
  separado), password hasheada.
- Businesses: listar, crear (genera webhook_secret), activar/desactivar.
- Cuentas por business: listar y crear el par accounts+credentials en una
  transacción. La cuenta nace "pendiente de conexión" (external_account_id
  NULL) hasta que el OAuth callback existente la complete.

Seguridad: los tokens de negocio NO sirven acá (salt distinto) y viceversa.
Los endpoints devuelven flags de credenciales, nunca tokens/secrets.
"""
import secrets
from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, jsonify, request
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from app import cache
from app.api.auth_utils import make_admin_token, require_admin, current_admin
from app.db.engine import engine
from app.db.helpers import execute, get_all, get_one, insert_and_get_id
from app.settings.config import SCHEMA_ACCOUNTS
from app.utils.logger import logger

platform_bp = Blueprint("platform_admin", __name__, url_prefix="/api/platform")

BUSINESSES_TABLE = SCHEMA_ACCOUNTS + ".businesses"
ADMINS_TABLE = SCHEMA_ACCOUNTS + ".admins"
ACCOUNTS_TABLE = SCHEMA_ACCOUNTS + ".accounts"
CREDENTIALS_TABLE = SCHEMA_ACCOUNTS + ".credentials"

PLATFORMS = ("mercadolibre", "tiendanube")


def _serializable(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat(sep=" ")
    if isinstance(value, Decimal):
        return float(value)
    return value


def _business_dict(row):
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "active": bool(row["active"]),
        "created_at": _serializable(row.get("created_at")),
    }


def _get_business_or_404(business_id):
    try:
        return get_one(
            "SELECT id, email, full_name, active, created_at FROM "
            + BUSINESSES_TABLE + " WHERE id = :id", {"id": business_id})
    except LookupError:
        return None


# ─── Admin auth ────────────────────────────────────────────────────────────────

@platform_bp.route("/login", methods=["POST"])
def platform_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"error": "missing_credentials",
                        "message": "Ingresá email y contraseña"}), 400
    try:
        row = get_one(
            "SELECT id, email, password, full_name, active FROM " + ADMINS_TABLE
            + " WHERE email = :email", {"email": email})
    except LookupError:
        return jsonify({"error": "invalid_credentials",
                        "message": "Email o contraseña incorrectos"}), 401
    if not check_password_hash(row["password"], password):
        return jsonify({"error": "invalid_credentials",
                        "message": "Email o contraseña incorrectos"}), 401
    if not row["active"]:
        return jsonify({"error": "admin_inactive",
                        "message": "Administrador desactivado"}), 403

    admin = {"id": row["id"], "email": row["email"], "full_name": row["full_name"]}
    logger.info("Admin login ok for %s", email)
    return jsonify({"token": make_admin_token(admin), "admin": admin})


@platform_bp.route("/password", methods=["PATCH"])
@require_admin
def platform_change_password():
    data = request.get_json(silent=True) or {}
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""
    try:
        row = get_one(
            "SELECT password FROM " + ADMINS_TABLE + " WHERE id = :id",
            {"id": current_admin()["id"]})
    except LookupError:
        return jsonify({"error": "not_found", "message": "Administrador no encontrado"}), 404
    if not check_password_hash(row["password"], current):
        return jsonify({"error": "invalid_password",
                        "message": "La contraseña actual no es correcta"}), 401
    if len(new) < 6:
        return jsonify({"error": "bad_request",
                        "message": "La nueva contraseña debe tener al menos 6 caracteres"}), 400
    execute("UPDATE " + ADMINS_TABLE + " SET password = :password WHERE id = :id",
            {"password": generate_password_hash(new), "id": current_admin()["id"]})
    logger.info("Admin password changed for id %s", current_admin()["id"])
    return jsonify({"status": "ok"})


# ─── Businesses ────────────────────────────────────────────────────────────────

@platform_bp.route("/businesses", methods=["GET"])
@require_admin
def platform_businesses():
    q = (request.args.get("q") or "").strip()
    try:
        page = max(1, int(request.args.get("page") or 1))
        page_size = min(200, max(1, int(request.args.get("page_size") or 50)))
    except ValueError:
        return jsonify({"error": "bad_request", "message": "Paginación inválida"}), 400

    like_q = "%" + q + "%"
    base = {"q": q, "like_q": like_q}
    filters = " WHERE (:q = '' OR b.email LIKE :like_q OR b.full_name LIKE :like_q)"

    rows = get_all(
        "SELECT b.id, b.email, b.full_name, b.active, b.created_at,"
        " (SELECT COUNT(*) FROM " + ACCOUNTS_TABLE + " a"
        "  WHERE a.business_id = b.id) AS accounts_count"
        " FROM " + BUSINESSES_TABLE + " b" + filters
        + " ORDER BY b.id DESC LIMIT :limit OFFSET :offset",
        dict(base, limit=page_size, offset=(page - 1) * page_size))
    total = int(get_one(
        "SELECT COUNT(*) AS total FROM " + BUSINESSES_TABLE + " b" + filters,
        base)["total"] or 0)

    return jsonify({
        "items": [dict(_business_dict(r), accounts_count=int(r["accounts_count"] or 0))
                  for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if total else 0,
    })


@platform_bp.route("/businesses", methods=["POST"])
@require_admin
def platform_create_business():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    full_name = (data.get("full_name") or "").strip()
    password = data.get("password") or ""

    if not email or "@" not in email:
        return jsonify({"error": "bad_request", "message": "Ingresá un email válido"}), 400
    if not full_name:
        return jsonify({"error": "bad_request", "message": "Ingresá el nombre del negocio"}), 400
    if len(password) < 6:
        return jsonify({"error": "bad_request",
                        "message": "La contraseña debe tener al menos 6 caracteres"}), 400

    try:
        get_one("SELECT id FROM " + BUSINESSES_TABLE + " WHERE email = :email",
                {"email": email})
        return jsonify({"error": "email_exists",
                        "message": "Ya existe un negocio con ese email"}), 409
    except LookupError:
        pass

    try:
        business_id = insert_and_get_id(
            "INSERT INTO " + BUSINESSES_TABLE
            + " (email, password, full_name, webhook_secret, active)"
            + " VALUES (:email, :password, :full_name, :secret, 1)",
            {"email": email, "password": generate_password_hash(password),
             "full_name": full_name, "secret": secrets.token_hex(32)})
    except IntegrityError:
        return jsonify({"error": "email_exists",
                        "message": "Ya existe un negocio con ese email"}), 409
    except Exception:
        logger.exception("Could not create business")
        return jsonify({"error": "internal_error",
                        "message": "No se pudo crear el negocio"}), 500

    logger.info("Platform admin created business %s (%s)", business_id, email)
    row = get_one(
        "SELECT id, email, full_name, active, created_at FROM " + BUSINESSES_TABLE
        + " WHERE id = :id", {"id": business_id})
    return jsonify({"business": _business_dict(row)}), 201


@platform_bp.route("/businesses/<int:business_id>", methods=["PATCH"])
@require_admin
def platform_patch_business(business_id):
    data = request.get_json(silent=True) or {}
    if "active" not in data or not isinstance(data["active"], bool):
        return jsonify({"error": "bad_request",
                        "message": "El campo active (true/false) es obligatorio"}), 400

    business = _get_business_or_404(business_id)
    if business is None:
        return jsonify({"error": "not_found", "message": "Negocio no encontrado"}), 404

    execute("UPDATE " + BUSINESSES_TABLE + " SET active = :active WHERE id = :id",
            {"active": 1 if data["active"] else 0, "id": business_id})
    # Desactivación estricta: invalidar el chequeo cacheado de "negocio
    # activo" (auth_utils._token_user_active) al instante.
    cache.invalidate_business(business_id)
    logger.info("Platform admin set business %s active=%s", business_id, data["active"])

    row = get_one(
        "SELECT id, email, full_name, active, created_at FROM " + BUSINESSES_TABLE
        + " WHERE id = :id", {"id": business_id})
    return jsonify({"business": _business_dict(row)})


# ─── Cuentas por business ──────────────────────────────────────────────────────

@platform_bp.route("/businesses/<int:business_id>/accounts", methods=["GET"])
@require_admin
def platform_accounts(business_id):
    if _get_business_or_404(business_id) is None:
        return jsonify({"error": "not_found", "message": "Negocio no encontrado"}), 404

    rows = get_all(
        "SELECT a.id, a.platform, a.external_account_id, a.name, a.created_at,"
        " c.id AS credentials_id, c.access_token, c.expires_at"
        " FROM " + ACCOUNTS_TABLE + " a"
        " LEFT JOIN " + CREDENTIALS_TABLE + " c ON c.account_id = a.id"
        " WHERE a.business_id = :b ORDER BY a.id",
        {"b": business_id})

    items = []
    for r in rows:
        items.append({
            "id": r["id"],
            "platform": r["platform"],
            "external_account_id": r.get("external_account_id"),
            "name": r.get("name"),
            "has_credentials": r.get("credentials_id") is not None,
            "has_access_token": bool(r.get("access_token")),
            "expires_at": _serializable(r.get("expires_at")),
            "created_at": _serializable(r.get("created_at")),
        })
    return jsonify({"items": items})


@platform_bp.route("/businesses/<int:business_id>/accounts", methods=["POST"])
@require_admin
def platform_create_account(business_id):
    if _get_business_or_404(business_id) is None:
        return jsonify({"error": "not_found", "message": "Negocio no encontrado"}), 404

    data = request.get_json(silent=True) or {}
    platform = (data.get("platform") or "").strip().lower()
    if platform not in PLATFORMS:
        return jsonify({"error": "invalid_platform",
                        "message": "Plataforma inválida: solo mercadolibre y tiendanube"}), 400

    # Regla: UNA cuenta por plataforma por business.
    try:
        existing = get_one(
            "SELECT id, name FROM " + ACCOUNTS_TABLE
            + " WHERE business_id = :b AND platform = :p",
            {"b": business_id, "p": platform})
        return jsonify({"error": "platform_exists",
                        "message": "Este negocio ya tiene una cuenta de %s (%s). "
                                   "Solo se permite una cuenta por plataforma."
                                   % (platform.capitalize(), existing.get("name"))}), 409
    except LookupError:
        pass

    external_id = (data.get("external_account_id") or "").strip() or None
    name = (data.get("name") or "").strip() or (
        "MercadoLibre" if platform == "mercadolibre" else "Tienda Nube")

    if external_id:
        try:
            get_one(
                "SELECT id FROM " + ACCOUNTS_TABLE
                + " WHERE platform = :p AND external_account_id = :e",
                {"p": platform, "e": external_id})
            return jsonify({"error": "duplicate_account",
                            "message": "Ya existe una cuenta de esa plataforma con ese ID/URL"}), 409
        except LookupError:
            pass

    client_id = (data.get("client_id") or "").strip() or None
    client_secret = (data.get("client_secret") or "").strip() or None

    # Tienda Nube: las credenciales de la app son del PARTNER (nosotros) y son
    # obligatorias al crear la cuenta — sin ellas el OAuth no puede intercambiar
    # el code. Para MercadoLibre siguen siendo opcionales.
    if platform == "tiendanube" and (not client_id or not client_secret):
        return jsonify({"error": "missing_app_credentials",
                        "message": "Para Tienda Nube, el Client ID y el Client Secret "
                                   "de la aplicación son obligatorios"}), 400

    try:
        with engine.begin() as conn:
            result = conn.execute(
                text("INSERT INTO " + ACCOUNTS_TABLE
                     + " (business_id, platform, external_account_id, name)"
                     + " VALUES (:b, :platform, :external_id, :name)"),
                {"b": business_id, "platform": platform,
                 "external_id": external_id, "name": name})
            account_id = result.lastrowid
            conn.execute(
                text("INSERT INTO " + CREDENTIALS_TABLE
                     + " (account_id, client_id, client_secret)"
                     + " VALUES (:account_id, :client_id, :client_secret)"),
                {"account_id": account_id, "client_id": client_id,
                 "client_secret": client_secret})
    except IntegrityError:
        # Race: la unique (business_id, platform) o la (platform,
        # external_account_id) se dispararon en el insert.
        return jsonify({"error": "duplicate_account",
                        "message": "Este negocio ya tiene una cuenta de esa plataforma, "
                                   "o ese identificador externo ya está en uso"}), 409
    except Exception:
        logger.exception("Could not create account for business %s", business_id)
        return jsonify({"error": "internal_error",
                        "message": "No se pudo crear la cuenta"}), 500

    logger.info("Platform admin created %s account %s for business %s",
                platform, account_id, business_id)
    row = get_one(
        "SELECT a.id, a.platform, a.external_account_id, a.name, a.created_at,"
        " c.id AS credentials_id, c.access_token, c.expires_at"
        " FROM " + ACCOUNTS_TABLE + " a"
        " LEFT JOIN " + CREDENTIALS_TABLE + " c ON c.account_id = a.id"
        " WHERE a.id = :id", {"id": account_id})
    return jsonify({"account": {
        "id": row["id"],
        "platform": row["platform"],
        "external_account_id": row.get("external_account_id"),
        "name": row.get("name"),
        "has_credentials": row.get("credentials_id") is not None,
        "has_access_token": bool(row.get("access_token")),
        "expires_at": _serializable(row.get("expires_at")),
        "created_at": _serializable(row.get("created_at")),
    }}), 201
