"""Callback OAuth de MercadoLibre y Tienda Nube.

GET /api/oauth/callback?code=...  (redirect_uri registrado en ambos DevCenters)

El browser llega acá después de que el usuario autoriza la app. El endpoint:
  1. Detecta la plataforma por el header `Referer`
     (auth.mercadolibre.com* vs *.mitiendanube.com).
  2. Matchea la cuenta:
     - ML: el code es "TG-<app_id>-<user_id>"; el user_id (último segmento)
       se busca en accounts.external_account_id.
     - TN: el hostname del Referer (ej. nicolasgall.mitiendanube.com) se
       compara con credentials.url normalizado.
  3. Intercambia el code por tokens usando client_id/client_secret de la fila
     credentials de la cuenta matcheada y guarda access_token/refresh_token/
     expires_at (ML) o access_token (TN).
  4. Cuenta no encontrada -> 400 + log. Nunca crea cuentas acá.
"""
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import requests
from flask import Blueprint, jsonify, request

from app.db.helpers import execute, get_all, get_one
from app.settings.config import SCHEMA_ACCOUNTS
from app.utils.logger import logger

oauth_bp = Blueprint("oauth_api", __name__, url_prefix="/api")

ACCOUNTS_TABLE = SCHEMA_ACCOUNTS + ".accounts"
CREDENTIALS_TABLE = SCHEMA_ACCOUNTS + ".credentials"

MELI_TOKEN_URL = "https://api.mercadolibre.com/oauth/token"
TN_TOKEN_URL = "https://www.tiendanube.com/apps/authorize/token"

PLATFORM_LABELS = {"mercadolibre": "MercadoLibre", "tiendanube": "Tienda Nube"}


# ─── helpers ──────────────────────────────────────────────────────────────────

def _referer_host():
    return _normalize_host(request.headers.get("Referer"))


def _normalize_host(raw_url):
    """Hostname en minúsculas y sin 'www.' de una URL (con o sin scheme)."""
    raw_url = (raw_url or "").strip()
    if not raw_url:
        return ""
    if "://" not in raw_url:
        raw_url = "//" + raw_url
    host = (urlparse(raw_url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _detect_platform(state=""):
    # El parámetro OAuth `state` es la fuente confiable (el front lo setea y
    # Meli/TN lo devuelven intacto). El Referer del browser es frágil
    # (puede no llegar por políticas del navegador) → solo fallback.
    if state in ("mercadolibre", "tiendanube"):
        return state
    host = _referer_host()
    if not host:
        return None
    if "mercadolibre" in host:
        return "mercadolibre"
    if "tiendanube" in host:
        return "tiendanube"
    return None


def _mercadolibre_user_id(code):
    """'TG-<app_id>-<user_id>' -> '<user_id>' (último segmento)."""
    parts = code.split("-")
    if len(parts) < 2 or not parts[-1]:
        raise LookupError("El código de MercadoLibre no tiene user_id válido")
    return parts[-1]


def _find_account(platform, code):
    if platform == "mercadolibre":
        return _find_mercadolibre_account(code)
    return _find_tiendanube_account()


def _find_mercadolibre_account(code):
    user_id = _mercadolibre_user_id(code)
    try:
        return get_one(
            "SELECT * FROM " + ACCOUNTS_TABLE
            + " WHERE platform = 'mercadolibre' AND external_account_id = :uid",
            {"uid": str(user_id)})
    except LookupError:
        raise LookupError("No hay cuenta de MercadoLibre para el usuario " + str(user_id))


def _find_tiendanube_account():
    host = _referer_host()
    rows = get_all(
        "SELECT c.account_id, c.url FROM " + CREDENTIALS_TABLE + " c"
        " JOIN " + ACCOUNTS_TABLE + " a ON a.id = c.account_id"
        " WHERE a.platform = 'tiendanube' AND c.url IS NOT NULL")
    for row in rows:
        if _normalize_host(row.get("url")) == host:
            try:
                return get_one("SELECT * FROM " + ACCOUNTS_TABLE
                               + " WHERE id = :aid", {"aid": row["account_id"]})
            except LookupError:
                continue
    raise LookupError("No hay cuenta de Tienda Nube para la tienda " + host)


def _app_credentials(account_id):
    """client_id/client_secret de la fila credentials de la cuenta."""
    try:
        creds = get_one(
            "SELECT * FROM " + CREDENTIALS_TABLE + " WHERE account_id = :aid",
            {"aid": account_id})
    except LookupError:
        raise LookupError("La cuenta no tiene credenciales cargadas")
    if not creds.get("client_id") or not creds.get("client_secret"):
        raise LookupError("La cuenta no tiene client_id/client_secret cargados")
    return creds


def _redirect_uri():
    # Debe ser EXACTA a la registrada en el DevCenter. Por defecto la URL real
    # del request; OAUTH_CALLBACK_URL la pisa (útil detrás de un proxy).
    return os.getenv("OAUTH_CALLBACK_URL") or request.base_url


def _token_error(platform, resp):
    """Mensaje legible cuando el exchange es rechazado."""
    try:
        body = resp.json()
        if isinstance(body, dict):
            for key in ("message", "error", "error_description", "cause"):
                if body.get(key):
                    return "{} respondió {} · {}".format(
                        platform, resp.status_code, str(body[key])[:200])
        return "{} respondió {} · {}".format(platform, resp.status_code, str(body)[:200])
    except Exception:
        return "{} respondió {}".format(platform, resp.status_code)


def _expires_at(expires_in):
    try:
        seconds = int(expires_in)
    except (TypeError, ValueError):
        return None
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=seconds)


def _exchange_mercadolibre(code, creds):
    resp = requests.post(
        MELI_TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
            "code": code,
            "redirect_uri": _redirect_uri(),
        },
        timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(_token_error("MercadoLibre", resp))
    data = resp.json() or {}
    if not data.get("access_token"):
        raise RuntimeError("MercadoLibre no devolvió access_token")
    return data


def _exchange_tiendanube(code, creds):
    resp = requests.post(
        TN_TOKEN_URL,
        data={
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
            "grant_type": "authorization_code",
            "code": code,
        },
        timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(_token_error("Tienda Nube", resp))
    data = resp.json() or {}
    if not data.get("access_token"):
        raise RuntimeError("Tienda Nube no devolvió access_token")
    return data


def _save_tokens(account_id, code, access_token, refresh_token=None, expires_at=None):
    execute(
        "UPDATE " + CREDENTIALS_TABLE
        + " SET code = :code, access_token = :access_token,"
        + " refresh_token = :refresh_token, expires_at = :expires_at"
        + " WHERE account_id = :account_id",
        {"code": code, "access_token": access_token,
         "refresh_token": refresh_token, "expires_at": expires_at,
         "account_id": account_id})


def _bad(message):
    return jsonify({"error": "bad_request", "message": message}), 400


def _success_html():
    """Mini página de confirmación para el browser (el usuario la ve)."""
    return (
        "<!doctype html><html lang='es'><head><meta charset='utf-8'>"
        "<title>Conexión exitosa</title></head>"
        "<body style='font-family: sans-serif; display:flex; align-items:center;"
        " justify-content:center; height:100vh; margin:0;'>"
        "<p style='font-size:1.2rem;'>✅ Conexión exitosa. Ya podés cerrar esta pestaña y volver al panel.</p>"
        "</body></html>"
    )


# ─── endpoint ─────────────────────────────────────────────────────────────────

@oauth_bp.route("/oauth/callback", methods=["GET"])
def oauth_callback():
    code = (request.args.get("code") or "").strip()
    if not code:
        return _bad("Falta el código de autorización (code)")

    platform = _detect_platform((request.args.get("state") or "").strip())
    if platform is None:
        logger.warning("OAuth callback: Referer irreconocible (%r)",
                       request.headers.get("Referer"))
        return _bad("No se pudo identificar la plataforma desde el Referer")

    try:
        account = _find_account(platform, code)
    except LookupError as exc:
        logger.warning("OAuth callback %s: %s", platform, exc)
        return _bad(str(exc))

    try:
        creds = _app_credentials(account["id"])
    except LookupError as exc:
        logger.warning("OAuth callback %s (account %s): %s",
                       platform, account["id"], exc)
        return _bad(str(exc))

    try:
        if platform == "mercadolibre":
            tokens = _exchange_mercadolibre(code, creds)
            _save_tokens(account["id"], code, tokens["access_token"],
                         tokens.get("refresh_token"),
                         _expires_at(tokens.get("expires_in")))
        else:
            tokens = _exchange_tiendanube(code, creds)
            _save_tokens(account["id"], code, tokens["access_token"])
            # TN devuelve `user_id` = ID de la tienda: todas las llamadas a la
            # API lo requieren en la URL (/v1/{store_id}/...). Lo guardamos en
            # accounts.external_account_id para uso futuro. OJO: TN puede
            # mandarlo como número, por eso se fuerza a string antes.
            raw_user_id = tokens.get("user_id")
            store_id = str(raw_user_id).strip() if raw_user_id else None
            if store_id:
                execute(
                    "UPDATE " + ACCOUNTS_TABLE
                    + " SET external_account_id = :store_id WHERE id = :aid",
                    {"store_id": store_id, "aid": account["id"]})
                logger.info("TN store id %s guardado para la cuenta %s",
                            store_id, account["id"])
    except RuntimeError as exc:
        logger.error("OAuth callback %s (account %s): %s",
                     platform, account["id"], exc)
        return jsonify({"error": "token_error", "message": str(exc)}), 502
    except requests.RequestException:
        logger.exception("OAuth token exchange falló (red) para %s account %s",
                         platform, account["id"])
        return jsonify({"error": "token_error",
                        "message": "No se pudo conectar con "
                        + PLATFORM_LABELS[platform]}), 502
    except Exception:
        logger.exception("OAuth token exchange falló para %s account %s",
                         platform, account["id"])
        return jsonify({"error": "internal_error",
                        "message": "No se pudo completar la conexión"}), 500

    logger.info("OAuth callback OK: %s account %s conectada", platform, account["id"])
    return _success_html(), 200, {"Content-Type": "text/html; charset=utf-8"}
