import requests
from flask import Blueprint, request, jsonify

from app import cache
from app.db.helpers import execute, get_one
from app.integrations.core.credentials import (
    get_access_token,
    get_account_owner,
    UnknownAccount,
)
from app.settings.config import SCHEMA_MERCADOLIBRE
from app.utils.logger import logger, set_event_id

LISTINGS_TABLE = SCHEMA_MERCADOLIBRE + ".product_listings"
MELI_BASE_URL = "https://api.mercadolibre.com"

item_status = Blueprint("wh_item_status", __name__, url_prefix="/webhooks/items")


@item_status.route("", methods=["POST"], strict_slashes=False)
def main():
    """Meli item notification: refresh the listing status from the API."""
    set_event_id(None)
    return process_item_notification(request.get_json(force=True))


def process_item_notification(data, account=None):
    """Shared logic for the items topic (also used by the /webhooks/meli dispatcher)."""
    if data.get("topic") != "items":
        return jsonify({"status": "ignored", "message": "not an item notification"}), 200

    user_id = data.get("user_id")
    meli_id = _item_id_from_resource(data.get("resource"))
    if not meli_id:
        return jsonify({"status": "ignored", "message": "missing item id"}), 200

    if account is None:
        try:
            account = get_account_owner(user_id, "mercadolibre")
        except UnknownAccount:
            logger.warning("Unknown Meli user_id %s; ignoring", user_id)
            return jsonify({"status": "ignored", "message": "unknown account"}), 200

    # Don't trust the notification payload: fetch the real item.
    try:
        item = _fetch_item(account, meli_id)
    except Exception as exc:
        logger.error("Failed to fetch Meli item %s: %s", meli_id, exc)
        return jsonify({"status": "error", "message": "fetch failed: " + str(exc)}), 500

    _update_listing_status(account, meli_id, item)
    return jsonify({"status": "done"}), 200


def _fetch_item(account, meli_id):
    """Fetch one item from MercadoLibre for the given account."""
    token = get_access_token(account["id"]).get("access_token")
    if not token:
        raise Exception("Missing access token for account " + str(account["id"]))
    response = requests.get(
        MELI_BASE_URL + "/items/" + str(meli_id),
        headers={"Authorization": "Bearer " + token},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def _fetch_moderation_wording(account, meli_id, status):
    """(reason, remedy) oficiales de la moderación de Meli para el item.

    GET /moderations/last_moderation/{item_id}-ITM devuelve wordings con
    REASON y REMEDY listos para el usuario (ej. "Corrige tus fotos: no cumple
    el tamaño mínimo"). El JSON crudo queda en el log. Fallback legible si la
    llamada falla o no hay moderación.
    """
    fallback = ("En revisión por MercadoLibre", None) if str(status).startswith("under_review") else (None, None)
    try:
        token = get_access_token(account["id"]).get("access_token")
        if not token:
            return fallback
        response = requests.get(
            MELI_BASE_URL + "/moderations/last_moderation/" + str(meli_id) + "-ITM",
            headers={"Authorization": "Bearer " + token},
            timeout=15,
        )
        if response.status_code != 200:
            return fallback
        body = response.json()
        logger.info("Moderation for %s (raw): %s", meli_id, response.text[:2000])
        reason = None
        remedy = None
        for mod in body if isinstance(body, list) else [body]:
            if not isinstance(mod, dict):
                continue
            for wording in mod.get("wordings") or []:
                if not isinstance(wording, dict) or not wording.get("value"):
                    continue
                if wording.get("type") == "REASON" and reason is None:
                    reason = str(wording["value"])
                elif wording.get("type") == "REMEDY" and remedy is None:
                    remedy = str(wording["value"])
        if reason or remedy:
            return reason or fallback[0], remedy
        return fallback
    except Exception:
        logger.exception("Could not fetch moderation wording for %s", meli_id)
        return fallback


def _update_listing_status(account, meli_id, item):
    """Router del sync de items: decide qué columna actualiza el evento.

    - id == meli_id (publicación principal) -> status + reason/remedy
      (moderación oficial, como siempre) y captura de catálogo:
        · si el item trae catalog_product_id y la fila no lo tiene, se guarda
          (detecta auto-optin por GTIN / catálogo requerido).
        · si el item dice catalog_listing=false y la fila tenía
          catalog_product_id, se limpia (flujo OPTOUT de Meli).
    - id == marketplace_item_id (publicación tradicional sombra) ->
      marketplace_status.
    - id desconocido -> no-op (como hasta hoy).
    """
    status = item.get("status")
    if not status:
        return
    try:
        row = get_one(
            "SELECT meli_id, marketplace_item_id, marketplace_status, catalog_product_id"
            " FROM " + LISTINGS_TABLE
            + " WHERE account_id = :account_id"
            + " AND (meli_id = :meli_id OR marketplace_item_id = :meli_id)",
            {"account_id": account["id"], "meli_id": meli_id})
    except LookupError:
        logger.info("Item %s has no local listing or status already up to date", meli_id)
        return

    # ── Publicación tradicional sombra ────────────────────────────────────────
    if row.get("marketplace_item_id") == meli_id:
        execute(
            "UPDATE " + LISTINGS_TABLE
            + " SET marketplace_status = :status"
            + " WHERE account_id = :account_id AND marketplace_item_id = :meli_id"
            + " AND (marketplace_status IS NULL OR marketplace_status != :status)",
            {"status": status, "account_id": account["id"], "meli_id": meli_id})
        cache.invalidate_business(account.get("business_id"))  # post-escritura
        logger.info("Shadow listing %s status synced to %s", meli_id, status)
        return

    # ── Publicación principal ─────────────────────────────────────────────────
    if str(status).startswith("under_review") or status in ("paused", "Paused."):
        reason, remedy = _fetch_moderation_wording(account, meli_id, status)
    else:
        reason, remedy = None, None

    # Skip the write when the row already has this exact state, so a zero
    # rowcount really means "no local listing" (MySQL reports 0 rows for
    # no-change updates). `<=>` is the MySQL null-safe equality: lets the
    # comparison work when reason/remedy are NULL.
    execute(
        "UPDATE " + LISTINGS_TABLE
        + " SET status = :status, reason = :reason, remedy = :remedy"
        + " WHERE account_id = :account_id AND meli_id = :meli_id"
        + " AND (status IS NULL OR status != :status"
        + "      OR NOT (reason <=> :reason)"
        + "      OR NOT (remedy <=> :remedy))",
        {"status": status, "reason": reason, "remedy": remedy,
         "account_id": account["id"], "meli_id": meli_id},
    )

    # Captura de catálogo (auto-optin / OPTOUT) sobre la fila principal.
    # CRÍTICO: Meli deja catalog_product_id en el payload de la publicación
    # tradicional AÚN después del opt-out (con catalog_listing=false). La
    # captura SOLO vale cuando catalog_listing es explícitamente True; si no,
    # se re-etiquetaba un item tradicional como catálogo fantasma.
    catalog_product_id = item.get("catalog_product_id")
    if (item.get("catalog_listing") is True and catalog_product_id
            and row.get("catalog_product_id") is None):
        execute(
            "UPDATE " + LISTINGS_TABLE
            + " SET catalog_product_id = :cpid"
            + " WHERE account_id = :account_id AND meli_id = :meli_id",
            {"cpid": str(catalog_product_id),
             "account_id": account["id"], "meli_id": meli_id})
        logger.info("Captured auto-optin: %s -> catalog product %s",
                    meli_id, catalog_product_id)
    elif item.get("catalog_listing") is False and row.get("catalog_product_id"):
        execute(
            "UPDATE " + LISTINGS_TABLE
            + " SET catalog_product_id = NULL, marketplace_item_id = NULL,"
            + " marketplace_status = NULL"
            + " WHERE account_id = :account_id AND meli_id = :meli_id",
            {"account_id": account["id"], "meli_id": meli_id})
        logger.info("Catalog optout by Meli: %s back to marketplace", meli_id)

    # OPTOUT situación 1 (Meli cierra la publicación de catálogo —fraude/IP/
    # legal— y deja la tradicional activa): auto-swap a la tradicional, que
    # vuelve a ser la principal; se limpia la relación de catálogo.
    if (status in ("closed", "inactive")
            and row.get("marketplace_item_id")
            and row.get("marketplace_status") in ("active", "Active")):
        execute(
            "UPDATE " + LISTINGS_TABLE
            + " SET meli_id = :shadow, catalog_product_id = NULL,"
            + " marketplace_item_id = NULL, marketplace_status = NULL,"
            + " status = :shadow_status, reason = NULL, remedy = NULL"
            + " WHERE account_id = :account_id AND meli_id = :meli_id",
            {"shadow": row["marketplace_item_id"],
             "shadow_status": row["marketplace_status"],
             "account_id": account["id"], "meli_id": meli_id})
        logger.info("OPTOUT by Meli (situación 1): %s closed; back to %s",
                    meli_id, row["marketplace_item_id"])

    # Cualquier sync de items tocó listados: invalidar la cache del negocio
    # DESPUÉS de la escritura (ver app/cache.py).
    cache.invalidate_business(account.get("business_id"))


def _item_id_from_resource(resource):
    # resource looks like "/items/MLA123456" -> return "MLA123456".
    if not resource:
        return None
    parts = resource.split("/")
    return parts[2] if len(parts) >= 3 else None
