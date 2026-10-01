"""Token creation/validation + the auth decorators for the REST API.

Tokens are signed with the app SECRET_KEY (itsdangerous), carry the full
user payload and expire after TOKEN_MAX_AGE seconds. `require_auth` loads
the user into flask.g so handlers can scope queries by business.

Desactivación estricta (panel de plataforma): `require_auth` verifica contra
la DB que el business (y el employee, si aplica) siga activo — un business
desactivado pierde acceso al instante, sin esperar la expiración del token.

Admins de plataforma: token con salt propio (no comparte el del negocio) y
guard `require_admin` que valida contra platform_accounts.admins.
"""
from functools import wraps

from flask import g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app import cache
from app.db.helpers import get_one
from app.settings.config import SCHEMA_ACCOUNTS, SECRET_KEY

TOKEN_MAX_AGE = 7 * 24 * 3600  # 7 days

# Cache del chequeo "negocio/usuario activo" (por request): corto a propósito
# y con invalidación explícita en platform_admin (activar/desactivar business)
# y en admin (PATCH de empleado). La desactivación estricta sigue siendo
# efectiva al instante porque esas rutas bulean la versión del negocio.
TTL_AUTH_ACTIVE = 60

BUSINESSES_TABLE = SCHEMA_ACCOUNTS + ".businesses"
EMPLOYEES_TABLE = SCHEMA_ACCOUNTS + ".employees"
ADMINS_TABLE = SCHEMA_ACCOUNTS + ".admins"

ADMIN_SALT = "omnipanel-admin-auth-v1"


def _serializer():
    return URLSafeTimedSerializer(SECRET_KEY, salt="omnipanel-auth-v1")


def _admin_serializer():
    return URLSafeTimedSerializer(SECRET_KEY, salt=ADMIN_SALT)


def make_token(user):
    """Sign a user dict (id, business_id, role, email, full_name)."""
    return _serializer().dumps(user)


def read_token(token):
    if not token:
        return None
    try:
        return _serializer().loads(token, max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None


def _token_user_active(user):
    """Desactivación estricta: un token de business/employee muere al instante
    si el business (o el employee) quedó inactivo en la DB.

    Cacheado por (business_id, role, user id) con la versión del negocio en
    la clave: la ruta de activar/desactivar del panel de plataforma y el
    PATCH de empleados invalidan la entrada al escribir.
    """
    return cache.get_or_compute(
        user.get("business_id"), "token_user_active", TTL_AUTH_ACTIVE,
        lambda: _token_user_active_db(user),
        user.get("role"), user.get("id"))


def _token_user_active_db(user):
    try:
        if user.get("role") == "employee":
            row = get_one(
                "SELECT e.active AS employee_active, b.active AS business_active"
                " FROM " + EMPLOYEES_TABLE + " e"
                " JOIN " + BUSINESSES_TABLE + " b ON b.id = e.business_id"
                " WHERE e.id = :id",
                {"id": user.get("id")})
            return bool(row["employee_active"]) and bool(row["business_active"])
        row = get_one(
            "SELECT active FROM " + BUSINESSES_TABLE + " WHERE id = :id",
            {"id": user.get("business_id")})
        return bool(row["active"])
    except LookupError:
        return False


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        token = header[7:] if header.startswith("Bearer ") else None
        user = read_token(token)
        if not user or not user.get("id") or not user.get("business_id"):
            return jsonify({"error": "unauthorized",
                            "message": "Sesión inválida o expirada"}), 401
        if not _token_user_active(user):
            return jsonify({"error": "inactive",
                            "message": "Tu cuenta o tu negocio fue desactivado. "
                                       "Contactá al administrador."}), 403
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def require_business(fn):
    """Restrict a route to business users (employees get 403).

    Stack it under @require_auth. Use it on every endpoint that belongs to
    the Ventas / Configuración / Usuarios sections.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = g.get("user") or {}
        if user.get("role") != "business":
            return jsonify({"error": "forbidden",
                            "message": "No tenés permisos para esta sección"}), 403
        return fn(*args, **kwargs)

    return wrapper


def current_user():
    """The authenticated user dict (only valid inside require_auth routes)."""
    return g.get("user") or {}


def current_business_id():
    return current_user().get("business_id")


# ─── Admins de plataforma (panel /api/platform) ────────────────────────────────

def make_admin_token(admin):
    """Sign an admin dict (id, email, full_name). Salt propio: los tokens de
    admin no son válidos en la API de negocios y viceversa."""
    return _admin_serializer().dumps(admin)


def read_admin_token(token):
    if not token:
        return None
    try:
        return _admin_serializer().loads(token, max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        token = header[7:] if header.startswith("Bearer ") else None
        admin = read_admin_token(token)
        if not admin or not admin.get("id"):
            return jsonify({"error": "unauthorized",
                            "message": "Sesión de administrador inválida o expirada"}), 401
        try:
            row = get_one(
                "SELECT active FROM " + ADMINS_TABLE + " WHERE id = :id",
                {"id": admin.get("id")})
        except LookupError:
            return jsonify({"error": "unauthorized",
                            "message": "Administrador inexistente"}), 401
        if not row["active"]:
            return jsonify({"error": "admin_inactive",
                            "message": "Administrador desactivado"}), 403
        g.admin = admin
        return fn(*args, **kwargs)

    return wrapper


def current_admin():
    """The authenticated admin dict (only valid inside require_admin routes)."""
    return g.get("admin") or {}
