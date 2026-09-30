"""Credenciales de integración para la pantalla Configuración (business-only).

- GET /api/mercadolibre/credentials -> app de ML (client_id/secret) + tokens OAuth
- PUT /api/mercadolibre/credentials -> guarda client_id/client_secret (no toca
  tokens) y, si viene `user_id`, lo persiste en accounts.external_account_id
  (campo con el que el callback OAuth matchea la cuenta).
- GET /api/tiendanube/credentials   -> URL de la tienda + tokens OAuth
- PUT /api/tiendanube/credentials   -> guarda la URL de la tienda

Reglas (invariantes del repo):
- Nunca se crean cuentas acá: si no hay cuenta vinculada, PUT responde 400.
- Todo scoped por business_id del token; Configuración es solo business.
- El token se renueva vía el callback /api/oauth/callback (nunca acá).
"""
import os

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.api.auth_utils import current_business_id, require_auth, require_business
from app.api.inventory import _serializable
from app.db.helpers import execute, get_one
from app.settings.config import SCHEMA_ACCOUNTS
from app.utils.logger import logger

credentials_bp = Blueprint("credentials_api", __name__, url_prefix="/api")

ACCOUNTS_TABLE = SCHEMA_ACCOUNTS + ".accounts"
CREDENTIALS_TABLE = SCHEMA_ACCOUNTS + ".credentials"


def _account(platform):
    """Primera cuenta del business para la plataforma (o None)."""
    try:
        return get_one(
            "SELECT * FROM " + ACCOUNTS_TABLE
            + " WHERE business_id = :b AND platform = :platform"
            " ORDER BY id LIMIT 1",
            {"b": current_business_id(), "platform": platform})
    except LookupError:
        return None


def _credentials(account_id):
    try:
        return get_one(
            "SELECT * FROM " + CREDENTIALS_TABLE + " WHERE account_id = :aid",
            {"aid": account_id})
    except LookupError:
        return None


def _missing_account(platform):
    return jsonify({
        "error": "missing_account",
        "message": ("No hay una cuenta de %s vinculada a tu negocio. "
                    "Contactá al administrador de la plataforma para vincularla."
                    % platform),
    }), 400


# ─── MercadoLibre ─────────────────────────────────────────────────────────────

@credentials_bp.route("/mercadolibre/credentials", methods=["GET"])
@require_auth
@require_business
def meli_credentials_get():
    account = _account("mercadolibre")
    creds = _credentials(account["id"]) if account else None
    return jsonify({
        "account_id": account["id"] if account else None,
        "connected": bool(account and creds and creds.get("access_token")),
        "client_id": creds.get("client_id") if creds else None,
        "client_secret": creds.get("client_secret") if creds else None,
        "external_account_id": account.get("external_account_id") if account else None,
        "access_token": creds.get("access_token") if creds else None,
        "refresh_token": creds.get("refresh_token") if creds else None,
        "code": creds.get("code") if creds else None,
        "expires_at": _serializable(creds.get("expires_at")) if creds else None,
        # Redirect URI exacta del DevCenter: la define el deploy (env), sino
        # el front usa su propio origin + /api/oauth/callback.
        "redirect_uri": os.getenv("OAUTH_CALLBACK_URL") or "",
    })


@credentials_bp.route("/mercadolibre/credentials", methods=["PUT"])
@require_auth
@require_business
def meli_credentials_put():
    data = request.get_json(silent=True) or {}
    client_id = (data.get("client_id") or "").strip()
    client_secret = (data.get("client_secret") or "").strip()
    user_id = (data.get("user_id") or "").strip()
    account = _account("mercadolibre")
    if account is None:
        return _missing_account("MercadoLibre")
    if not client_id:
        return jsonify({"error": "bad_request",
                        "message": "El Client ID es obligatorio"}), 400
    if user_id and not user_id.isdigit():
        return jsonify({"error": "bad_request",
                        "message": "El ID de usuario debe ser numérico"}), 400

    execute(
        "INSERT INTO " + CREDENTIALS_TABLE
        + " (account_id, client_id, client_secret)"
        + " VALUES (:aid, :client_id, :client_secret)"
        + " ON DUPLICATE KEY UPDATE client_id = VALUES(client_id),"
        + " client_secret = VALUES(client_secret)",
        {"aid": account["id"], "client_id": client_id,
         "client_secret": client_secret or None})

    # ID de usuario de Meli -> accounts.external_account_id (es el campo con
    # el que el callback OAuth matchea la cuenta). Scoped por business_id vía
    # _account(); la UNIQUE (platform, external_account_id) protege de
    # duplicados entre negocios.
    if user_id:
        try:
            execute(
                "UPDATE " + ACCOUNTS_TABLE
                + " SET external_account_id = :uid"
                + " WHERE id = :aid AND business_id = :b",
                {"uid": user_id, "aid": account["id"],
                 "b": current_business_id()})
        except IntegrityError:
            # UNIQUE (platform, external_account_id): el id ya lo usa otra
            # cuenta (posiblemente de otro negocio).
            logger.warning("ML user id %s already in use", user_id)
            return jsonify({
                "error": "user_id_in_use",
                "message": ("Ese ID de usuario ya está vinculado a otra cuenta "
                            "de MercadoLibre"),
            }), 409

    logger.info("ML credentials updated for account %s (business %s)",
                account["id"], current_business_id())
    return jsonify({"status": "ok"})


# ─── Tienda Nube ──────────────────────────────────────────────────────────────

@credentials_bp.route("/tiendanube/credentials", methods=["GET"])
@require_auth
@require_business
def tn_credentials_get():
    account = _account("tiendanube")
    creds = _credentials(account["id"]) if account else None
    return jsonify({
        "account_id": account["id"] if account else None,
        "connected": bool(account and creds and creds.get("access_token")),
        "client_id": creds.get("client_id") if creds else None,
        "url": creds.get("url") if creds else None,
        "access_token": creds.get("access_token") if creds else None,
        # ID de la tienda (user_id del OAuth): la API lo usa en la URL /v1/{id}/...
        "external_account_id": account["external_account_id"] if account else None,
    })


@credentials_bp.route("/tiendanube/credentials", methods=["PUT"])
@require_auth
@require_business
def tn_credentials_put():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    account = _account("tiendanube")
    if account is None:
        return _missing_account("Tienda Nube")
    if not url:
        return jsonify({"error": "bad_request",
                        "message": "La URL de la tienda es obligatoria"}), 400

    execute(
        "INSERT INTO " + CREDENTIALS_TABLE + " (account_id, url)"
        + " VALUES (:aid, :url)"
        + " ON DUPLICATE KEY UPDATE url = VALUES(url)",
        {"aid": account["id"], "url": url})
    logger.info("TN credentials updated for account %s (business %s)",
                account["id"], current_business_id())
    return jsonify({"status": "ok"})
