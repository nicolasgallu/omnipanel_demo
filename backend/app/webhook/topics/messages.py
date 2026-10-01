"""Topic handlers: messages / questions -> mercadolibre.messages.

Each handler receives the resolved account dict and the raw notification.
They fetch the real resource from the Meli API (never trust the payload) and
upsert a flat projection. They never raise into the dispatcher; failures are
logged and the inbox row remains the safety net.

After the upsert, unanswered conversations flow into the AI reply pipeline
(`app.pipelines.messages.process_incoming`) so a first question can be answered
or suggested automatically.
"""
import json

from app.db.helpers import execute, get_one
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


def process_incoming(row_id):
    """Lazy delegate al pipeline de respuestas (module attr para tests).

    El import es lazy para evitar ciclos de import (el pipeline importa
    product_handler, no al revés).
    """
    from app.pipelines import messages as msg_pipeline
    return msg_pipeline.process_incoming(row_id)


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
    buyer_name = None
    last_text = None

    if kind == "question":
        question = payload.get("question") or {}
        status = question.get("status")
        from_user_id = (payload.get("from") or {}).get("id")
        sender = payload.get("from") or {}
        buyer_name = sender.get("nickname") or sender.get("name")
        last_text = question.get("text")
    else:
        msgs = payload.get("messages") or []
        if msgs:
            first = msgs[0]
            status = first.get("status")
            from_user_id = (first.get("from") or {}).get("user_id")
            to_user_id = (first.get("to") or {}).get("user_id")
            buyer_name = (first.get("from") or {}).get("name")
            last_text = msgs[-1].get("text") or payload.get("text")

    execute(
        "INSERT INTO " + MESSAGES_TABLE
        + " (account_id, kind, external_id, item_id, order_id, from_user_id, to_user_id,"
        + " status, data, buyer_name, last_text)"
        + " VALUES (:account_id, :kind, :external_id, :item_id, :order_id, :from_user_id,"
        + " :to_user_id, :status, :data, :buyer_name, :last_text)"
        + " ON DUPLICATE KEY UPDATE item_id = VALUES(item_id), order_id = VALUES(order_id),"
        + " from_user_id = VALUES(from_user_id), to_user_id = VALUES(to_user_id),"
        + " status = VALUES(status), data = VALUES(data),"
        + " buyer_name = COALESCE(VALUES(buyer_name), buyer_name),"
        + " last_text = COALESCE(VALUES(last_text), last_text),"
        + " updated_at = NOW()",
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
            "buyer_name": buyer_name,
            "last_text": last_text,
        },
    )
    logger.info("Stored Meli %s %s", kind, entity_id)
    _maybe_process(kind, account, entity_id, payload)


def _maybe_process(kind, account, entity_id, payload):
    """Sincroniza estado desde Meli y, si sigue sin responder, corre el pipeline."""
    try:
        row = get_one(
            "SELECT id, reply_status, to_user_id FROM " + MESSAGES_TABLE
            + " WHERE account_id = :a AND kind = :k AND external_id = :e",
            {"a": account["id"], "k": kind, "e": str(entity_id)})
    except LookupError:
        return

    _sync_status(row, kind, payload)

    try:
        row = get_one(
            "SELECT id, reply_status FROM " + MESSAGES_TABLE + " WHERE id = :id",
            {"id": row["id"]})
    except LookupError:
        return

    if row.get("reply_status") is None:
        try:
            process_incoming(row["id"])
        except Exception:
            logger.exception("process_incoming failed for message %s", row["id"])


def _sync_status(row, kind, payload):
    """Marca answered/closed cuando Meli ya lo resolvió por otro medio."""
    if row.get("reply_status") is not None:
        return
    new_status = None
    if kind == "question":
        q_status = (payload.get("question") or {}).get("status")
        if q_status == "ANSWERED":
            new_status = "answered"
        elif q_status in ("DELETED", "CLOSED_UNANSWERED", "BANNED", "DISABLED"):
            new_status = "closed"
    else:
        msgs = payload.get("messages") or []
        if msgs:
            last_from = (msgs[-1].get("from") or {}).get("user_id")
            if last_from is not None and row.get("to_user_id") is not None \
                    and str(last_from) == str(row["to_user_id"]):
                new_status = "answered"

    if new_status:
        execute("UPDATE " + MESSAGES_TABLE + " SET reply_status = :s WHERE id = :id",
                {"s": new_status, "id": row["id"]})
        logger.info("Message %s synced to %s from Meli", row["id"], new_status)
