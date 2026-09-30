import hashlib
import json
from sqlalchemy.exc import IntegrityError
from app.db.helpers import execute, get_one
from app.settings.config import SCHEMA_ACCOUNTS


EVENTS_TABLE = SCHEMA_ACCOUNTS + ".events"
EMPLOYEES_TABLE = SCHEMA_ACCOUNTS + ".employees"

MAX_ATTEMPTS = 10
RECLAIM_AFTER_SECONDS = 900


def claim(account_id, source, event_type, external_id, payload=None, actor_id=None, actor_role=None):
    """Try to become the worker in charge of this event.

    Returns the event id when we win, or None when someone else is already
    processing it. actor_id/actor_role are audit metadata (businesses or
    employees); None means a system event (orders, item status).
    """
    _insert_pending(account_id, source, event_type, external_id, payload, actor_id, actor_role)
    return _try_claim(account_id, source, event_type, external_id)


def resolve_actor(account_business_id, actor_role, actor_id):
    """Validate the payload's actor and return (actor_id, actor_role).

    'business' actions attribute to the business itself; 'employee' actions
    require the employee to exist, belong to the same business and be active.
    Raises ValueError with a user-facing message when invalid.
    """
    if actor_role == "business":
        try:
            actor_id_int = int(actor_id) if actor_id is not None else account_business_id
        except (TypeError, ValueError):
            raise ValueError("invalid actor_id")
        if actor_id_int != account_business_id:
            raise ValueError("actor business does not match account business")
        return actor_id_int, "business"

    if actor_role == "employee":
        if not actor_id:
            raise ValueError("missing actor_id for employee role")
        try:
            actor_id_int = int(actor_id)
        except (TypeError, ValueError):
            raise ValueError("invalid actor_id")
        try:
            get_one(
                "SELECT id FROM " + EMPLOYEES_TABLE
                + " WHERE id = :id AND business_id = :business_id AND active = 1",
                {"id": actor_id_int, "business_id": account_business_id},
            )
        except LookupError:
            raise ValueError("unknown employee for this business")
        return actor_id_int, "employee"

    raise ValueError("invalid actor_role: " + str(actor_role))


def finish(event_id):
    _set_status(event_id, "done")


def store_notification(account_id, platform, topic, payload):
    """Store one inbound platform notification in the events inbox.

    Raw stream, exactly-once: Meli re-delivers the same notification with the
    same `_id`, and the unique key (account_id, source, event_type,
    external_id) dedups it. No `_id` -> deterministic hash of the raw body.
    Inserted directly as 'done': these rows are an audit inbox, not work to
    claim (no actor, no attempts).
    """
    notification_id = payload.get("_id") if isinstance(payload, dict) else None
    if not notification_id:
        notification_id = hashlib.sha256(
            json.dumps(payload, sort_keys=True, default=str).encode()
        ).hexdigest()
    execute(
        "INSERT IGNORE INTO " + EVENTS_TABLE
        + " (account_id, source, event_type, external_id, payload, status)"
        + " VALUES (:account_id, :source, :event_type, :external_id, :payload, 'done')",
        {
            "account_id": account_id,
            "source": platform,
            "event_type": topic,
            "external_id": str(notification_id),
            "payload": _to_json(payload),
        },
    )


def fail(event_id):
    _set_status(event_id, "failed")


def heartbeat(event_id):
    """Keep a long-running event alive so it is not stolen while working."""
    execute(
        "UPDATE " + EVENTS_TABLE + " SET updated_at = NOW() WHERE id = :id",
        {"id": event_id},
    )


def _insert_pending(account_id, source, event_type, external_id, payload, actor_id, actor_role):
    sql = (
        "INSERT INTO " + EVENTS_TABLE
        + " (account_id, source, event_type, external_id, payload, status, actor_id, actor_role)"
        + " VALUES (:account_id, :source, :event_type, :external_id, :payload, 'pending', :actor_id, :actor_role)"
    )
    try:
        execute(sql, {
            "account_id": account_id,
            "source": source,
            "event_type": event_type,
            "external_id": external_id,
            "payload": _to_json(payload),
            "actor_id": actor_id,
            "actor_role": actor_role,
        })
    except IntegrityError:
        # The row already exists (duplicate delivery). Fine, the claim below
        # decides who owns it.
        pass


def _try_claim(account_id, source, event_type, external_id):
    sql = (
        "UPDATE " + EVENTS_TABLE
        + " SET status = 'processing', updated_at = NOW(), attempts = attempts + 1"
        + " WHERE account_id = :account_id"
        + " AND source = :source"
        + " AND event_type = :event_type"
        + " AND external_id = :external_id"
        + " AND ("
        + "     status = 'pending'"
        + "     OR (status = 'processing' AND updated_at < NOW() - INTERVAL "
        + str(RECLAIM_AFTER_SECONDS) + " SECOND)"
        + "     OR (status = 'failed' AND attempts < :max_attempts)"
        + " )"
    )
    rowcount = execute(sql, {
        "account_id": account_id,
        "source": source,
        "event_type": event_type,
        "external_id": external_id,
        "max_attempts": MAX_ATTEMPTS,
    })
    if rowcount == 1:
        return _event_id(account_id, source, event_type, external_id)
    return None


def _event_id(account_id, source, event_type, external_id):
    sql = (
        "SELECT id FROM " + EVENTS_TABLE
        + " WHERE account_id = :account_id"
        + " AND source = :source"
        + " AND event_type = :event_type"
        + " AND external_id = :external_id"
    )
    row = get_one(sql, {
        "account_id": account_id,
        "source": source,
        "event_type": event_type,
        "external_id": external_id,
    })
    return row["id"]


def _set_status(event_id, status):
    execute(
        "UPDATE " + EVENTS_TABLE
        + " SET status = :status, updated_at = NOW() WHERE id = :id",
        {"status": status, "id": event_id},
    )


def _to_json(payload):
    if payload is None:
        return None
    if isinstance(payload, str):
        return payload
    return json.dumps(payload)