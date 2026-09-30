"""Auth endpoints for the frontend: login + current user."""
import hmac

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash

from app.api.auth_utils import current_user, make_token, require_auth, require_business
from app.db.helpers import execute, get_one
from app.settings.config import SCHEMA_ACCOUNTS
from app.utils.logger import logger

auth_bp = Blueprint("auth_api", __name__, url_prefix="/api/auth")

BUSINESSES_TABLE = SCHEMA_ACCOUNTS + ".businesses"
EMPLOYEES_TABLE = SCHEMA_ACCOUNTS + ".employees"

# Werkzeug hashes start with one of these prefixes; anything else is treated
# as a legacy plaintext password so existing DB rows keep working.
_HASH_PREFIXES = ("pbkdf2:", "scrypt:", "$2b$", "$2a$", "$argon2")


def _verify_password(stored, candidate):
    if not stored:
        return False
    if stored.startswith(_HASH_PREFIXES):
        return check_password_hash(stored, candidate)
    # Legacy plaintext comparison (constant time).
    return hmac.compare_digest(stored, candidate)


def _public_user(row):
    return {
        "id": row["id"],
        "business_id": row["business_id"],
        "role": row["role"],
        "email": row["email"],
        "full_name": row["full_name"],
    }


def _find_user(email):
    """Look for the email in businesses first, then in active employees.

    Returns the normalized user row or None.
    """
    try:
        row = get_one(
            "SELECT id, id AS business_id, email, password, full_name, active, "
            "'business' AS role FROM " + BUSINESSES_TABLE + " WHERE email = :email",
            {"email": email})
        return row
    except LookupError:
        pass

    try:
        row = get_one(
            "SELECT e.id, e.business_id, e.email, e.password, e.full_name, e.active, "
            "b.active AS business_active, 'employee' AS role"
            " FROM " + EMPLOYEES_TABLE + " e"
            " JOIN " + BUSINESSES_TABLE + " b ON b.id = e.business_id"
            " WHERE e.email = :email",
            {"email": email})
        if not row.get("active"):
            return None
        return row
    except LookupError:
        return None


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "missing_credentials",
                        "message": "Ingresá tu email y contraseña"}), 400

    user = _find_user(email)
    if user is None or not _verify_password(user.get("password"), password):
        return jsonify({"error": "invalid_credentials",
                        "message": "Email o contraseña incorrectos"}), 401

    # Desactivación estricta: bloqueamos el login además de matar los tokens
    # ya emitidos (el chequeo por request está en require_auth).
    if not user.get("active") or (user.get("role") == "employee" and not user.get("business_active")):
        return jsonify({"error": "inactive",
                        "message": "Tu cuenta o tu negocio fue desactivado. "
                                   "Contactá al administrador."}), 403

    public = _public_user(user)
    token = make_token(public)
    logger.info("Login ok for %s (role=%s)", email, public["role"])
    return jsonify({"token": token, "user": public})


@auth_bp.route("/password", methods=["PATCH"])
@require_auth
@require_business
def change_password():
    """Cambia la contraseña del usuario logueado (business o employee)."""
    data = request.get_json(silent=True) or {}
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""

    user = current_user()
    table = BUSINESSES_TABLE if user["role"] == "business" else EMPLOYEES_TABLE
    try:
        row = get_one(
            "SELECT password FROM " + table + " WHERE id = :id",
            {"id": user["id"]})
    except LookupError:
        return jsonify({"error": "not_found", "message": "Usuario no encontrado"}), 404

    if not _verify_password(row.get("password"), current):
        return jsonify({"error": "invalid_password",
                        "message": "La contraseña actual no es correcta"}), 401
    if len(new) < 6:
        return jsonify({"error": "bad_request",
                        "message": "La nueva contraseña debe tener al menos 6 caracteres"}), 400

    execute("UPDATE " + table + " SET password = :password WHERE id = :id",
            {"password": new, "id": user["id"]})
    logger.info("Password changed for %s", user.get("email"))
    return jsonify({"status": "ok"})


@auth_bp.route("/me", methods=["GET"])
@require_auth
def me():
    return jsonify({"user": current_user()})
