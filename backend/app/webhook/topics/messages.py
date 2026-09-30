"""Topic handlers: messages / questions -> mercadolibre.messages.

Each handler receives the resolved account dict and the raw notification.
They fetch the real resource from the Meli API (never trust the payload) and
upsert a flat projection. They never raise into the dispatcher; failures are
logged and the inbox row remains the safety net.
"""
import json

from app.db.helpers import execute
from app.integrations.core.credentials import get_access_token
from app.integrations.mercadolibre.product_handler import _meli_request
from app.utils.logger import logger

MESSAGES_TABLE = "mercadolibre.messages"
MELI_BASE_URL = "https://api.mercadolibre.com"


def handle_message(account, data):
    """Topic 'messages' (post-sale messaging)."""
    _upsert(account, data, kind="message")


def handle_question(account, data):
    """Topic 'questions' (pre-sale Q&A)."""
    _upsert(account, data, kind="question")


def _upsert(account, data, kind):
    token = get_access_token(account["id"]).get("access_token")
    resource = data.get("resource") or ""
    # messages: bare id; questions: /questions/{id}
    entity_id = resource.rstrip("/").split("/")[-1] if "/" in resource else resource
    if not entity_id:
        return

    url = MELI_BASE_URL + "/" + ("questions/" if kind == "question" else "messages/") + entity_id
    try:
        response = _meli_request("GET", url, token, timeout=30)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        logger.warning("Could not fetch Meli %s %s: %s", kind, entity_id, exc)
        return

    status = None
    from_user_id = None
    to_user_id = None
    item_id = payload.get("item_id")

    if kind == "question":
        question = payload.get("question") or {}
        status = question.get("status")
        from_user_id = (payload.get("from") or {}).get("id")
    else:
        messages = payload.get("messages") or []
        if messages:
            first = messages[0]
            status = first.get("status")
            from_user_id = (first.get("from") or {}).get("user_id")
            to_user_id = (first.get("to") or {}).get("user_id")

    execute(
        "INSERT INTO " + MESSAGES_TABLE
        + " (account_id, kind, external_id, item_id, order_id, from_user_id, to_user_id, status, data)"
        + " VALUES (:account_id, :kind, :external_id, :item_id, :order_id, :from_user_id, :to_user_id, :status, :data)"
        + " ON DUPLICATE KEY UPDATE item_id = VALUES(item_id), order_id = VALUES(order_id),"
        + " from_user_id = VALUES(from_user_id), to_user_id = VALUES(to_user_id),"
        + " status = VALUES(status), data = VALUES(data), updated_at = NOW()",
        {
            "account_id": account["id"],
            "kind": kind,
            "external_id": str(entity_id),
            "item_id": str(item_id) if item_id else None,
            "order_id": None,
            "from_user_id": str(from_user_id) if from_user_id else None,
            "to_user_id": str(to_user_id) if to_user_id else None,
            "status": str(status) if status else None,
            "data": json.dumps(payload, ensure_ascii=False),
        },
    )
    logger.info("Stored Meli %s %s", kind, entity_id)
