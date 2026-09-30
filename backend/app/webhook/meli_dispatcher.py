from flask import Blueprint, request, jsonify

from app.db.claims import store_notification
from app.integrations.core.credentials import (
    get_account_owner,
    is_business_active,
    UnknownAccount,
)
from app.utils.logger import logger, set_event_id
from app.webhook.item_event import process_item_notification
from app.webhook.selling_event import _handle_meli

meli = Blueprint("wh_meli", __name__, url_prefix="/webhooks/meli")


@meli.route("", methods=["POST"], strict_slashes=False)
def main():
    """Single Meli callback: inbox + route the notification by its topic.

    Every topic lands first in platform_accounts.events (raw, deduped by _id),
    then a topic handler (registry) may fetch the resource and upsert a flat
    projection. Handlers never fail the request: the inbox row is the safety
    net and Meli only needs a fast 200.
    """
    set_event_id(None)
    data = request.get_json(force=True)
    topic = data.get("topic") if isinstance(data, dict) else None

    # Orders keep their own claim-based event rows (sells pipeline).
    if topic == "orders_v2":
        return _handle_meli(data)

    account = _resolve_account(data)
    if account is None:
        return jsonify({"status": "ignored", "message": "unknown account"}), 200

    store_notification(account["id"], "mercadolibre", topic, data)

    if topic == "items":
        return process_item_notification(data, account)

    handler = _lookup_handler(topic)
    if handler:
        try:
            handler(account, data)
        except Exception:
            # Always ack 200; the inbox row is already safe.
            logger.exception("Notification handler failed for topic %s", topic)

    return jsonify({"status": "done"}), 200


def _resolve_account(data):
    user_id = data.get("user_id")
    if not user_id:
        return None
    try:
        account = get_account_owner(user_id, "mercadolibre")
    except UnknownAccount:
        logger.warning("Unknown Meli user_id %s; ignoring", user_id)
        return None
    # Desactivación estricta: notificaciones de businesses inactivos se
    # ignoran (ack 200 para que Meli no reintente en loop).
    if not is_business_active(account):
        logger.info("Ignoring Meli notification for inactive business %s",
                    account.get("business_id"))
        return None
    return account


def _lookup_handler(topic):
    try:
        from app.webhook.registry import TOPIC_HANDLERS
        return TOPIC_HANDLERS.get("mercadolibre", {}).get(topic)
    except Exception:
        logger.exception("Could not load topic registry")
        return None
