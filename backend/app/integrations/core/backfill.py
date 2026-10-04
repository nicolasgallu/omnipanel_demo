"""Backfills históricos de MercadoLibre: preguntas y envíos.

PULL + upsert SIN efectos secundarios:
- preguntas: /questions/search -> mercadolibre.messages (kind=question). NO corre
  el pipeline de IA (`_maybe_process`); `reply_status` se resuelve del estado de
  Meli para que nunca se tomen como pendientes.
- envíos: enumera shipping.id de /orders/search -> /shipments/{id} ->
  mercadolibre.shipments. NO notifica ni sube etiquetas a GCS.

Idempotente por unique keys (account_id + kind + external_id / account_id +
external_id). Reusable para cualquier cuenta/business.
"""
import json
from datetime import datetime, timezone

from app.db.helpers import execute, get_all
from app.integrations.mercadolibre.orders import fetch_orders_page
from app.integrations.mercadolibre.questions import (
    fetch_question,
    fetch_questions_page,
    fetch_user_nickname,
)
from app.integrations.mercadolibre.shipments import fetch_shipment

MESSAGES_TABLE = "mercadolibre.messages"
SHIPMENTS_TABLE = "mercadolibre.shipments"
REPLIES_TABLE = "mercadolibre.replies"


def _reply_status_from_question(status):
    """Estado de Meli -> reply_status (espejo de topics/messages.py::_sync_status)."""
    if status == "ANSWERED":
        return "answered"
    if status in ("DELETED", "CLOSED_UNANSWERED", "BANNED", "DISABLED"):
        return "closed"
    return "unanswered"


def backfill_questions(account, dry_run=True):
    fetched = written = 0
    errors = []
    offset = 0
    while True:
        try:
            questions, total = fetch_questions_page(account, offset=offset, limit=50)
        except Exception as exc:
            errors.append("questions offset=%s: %s" % (offset, exc))
            break
        if not questions:
            break
        for q in questions:
            fetched += 1
            if dry_run:
                continue
            try:
                _upsert_question(account, q)
                written += 1
            except Exception as exc:
                errors.append("question %s: %s" % (q.get("id"), exc))
        offset += len(questions)
        if offset >= total:
            break
    return {"fetched": fetched, "written": written, "errors": errors}


def _upsert_question(account, q):
    external_id = str(q.get("id"))
    item_id = str(q.get("item_id")) if q.get("item_id") else None
    from_user = (q.get("from") or {}).get("id")
    status = q.get("status")
    text = q.get("text")
    execute(
        "INSERT INTO " + MESSAGES_TABLE
        + " (account_id, kind, external_id, item_id, from_user_id, status, data, last_text, reply_status)"
        + " VALUES (:account_id, 'question', :external_id, :item_id, :from_user_id, :status, :data, :last_text, :reply_status)"
        + " ON DUPLICATE KEY UPDATE item_id = VALUES(item_id), from_user_id = VALUES(from_user_id),"
        + " status = VALUES(status), data = VALUES(data), last_text = VALUES(last_text),"
        + " reply_status = VALUES(reply_status), updated_at = NOW()",
        {
            "account_id": account["id"],
            "external_id": external_id,
            "item_id": item_id,
            "from_user_id": str(from_user) if from_user else None,
            "status": status,
            "data": json.dumps(q, ensure_ascii=False),
            "last_text": text,
            "reply_status": _reply_status_from_question(status),
        },
    )


def backfill_shipments(account, dry_run=True):
    fetched = written = 0
    errors = []
    seen = set()
    offset = 0
    while True:
        try:
            orders, total = fetch_orders_page(account, offset=offset, limit=50)
        except Exception as exc:
            errors.append("orders offset=%s: %s" % (offset, exc))
            break
        if not orders:
            break
        for o in orders:
            ship_id = (o.get("shipping") or {}).get("id")
            if not ship_id or ship_id in seen:
                continue
            seen.add(ship_id)
            fetched += 1
            if dry_run:
                continue
            try:
                payload = fetch_shipment(account, ship_id)
                _upsert_shipment(account, payload)
                written += 1
            except Exception as exc:
                errors.append("shipment %s: %s" % (ship_id, exc))
        offset += len(orders)
        if offset >= total:
            break
    return {"fetched": fetched, "written": written, "errors": errors}


def _upsert_shipment(account, payload):
    external_id = str(payload.get("id"))
    order_id = str(payload.get("order_id")) if payload.get("order_id") else None
    raw_status = payload.get("status") or payload.get("substatus")
    status = str(raw_status) if raw_status else None
    execute(
        "INSERT INTO " + SHIPMENTS_TABLE
        + " (account_id, external_id, order_id, status, data)"
        + " VALUES (:account_id, :external_id, :order_id, :status, :data)"
        + " ON DUPLICATE KEY UPDATE order_id = VALUES(order_id), status = VALUES(status),"
        + " data = VALUES(data), updated_at = NOW()",
        {
            "account_id": account["id"],
            "external_id": external_id,
            "order_id": order_id,
            "status": status,
            "data": json.dumps(payload, ensure_ascii=False),
        },
    )


def backfill_questions_enrich(account, dry_run=True):
    """Segunda pasada de preguntas: buyer_name (nickname) + respuesta del hilo.

    Recorre las preguntas ya cargadas en mercadolibre.messages y, por cada una:
    - GET /users/{from_user_id} -> buyer_name (best-effort).
    - GET /questions/{id} -> answer -> fila en mercadolibre.replies (dedup por
      message_id + text; solo status ANSWERED).
    """
    rows = get_all(
        "SELECT id, external_id, from_user_id, buyer_name, status"
        " FROM " + MESSAGES_TABLE
        + " WHERE account_id = :aid AND kind = 'question'",
        {"aid": account["id"]})
    fetched = len(rows)
    names = answers = 0
    errors = []

    for r in rows:
        if not r.get("buyer_name") and r.get("from_user_id"):
            try:
                nick = fetch_user_nickname(account, r["from_user_id"])
                if nick:
                    if not dry_run:
                        execute(
                            "UPDATE " + MESSAGES_TABLE
                            + " SET buyer_name = :n WHERE id = :id",
                            {"n": nick, "id": r["id"]})
                    names += 1
            except Exception as exc:
                errors.append("user %s: %s" % (r.get("from_user_id"), exc))

        if r.get("status") == "ANSWERED":
            try:
                q = fetch_question(account, r["external_id"])
                ans = q.get("answer") or {}
                text = ans.get("text")
                if text:
                    if not dry_run:
                        _insert_answer(account, r["id"], text, ans.get("date_created"))
                    answers += 1
            except Exception as exc:
                errors.append("question %s: %s" % (r.get("external_id"), exc))

    return {"fetched": fetched, "names": names, "answers": answers, "errors": errors}


def _insert_answer(account, message_id, text, answer_date):
    # dedup por (message_id, text): re-run no duplica respuestas.
    exists = get_all(
        "SELECT id FROM " + REPLIES_TABLE
        + " WHERE message_id = :mid AND text = :text LIMIT 1",
        {"mid": message_id, "text": text})
    if exists:
        return
    execute(
        "INSERT INTO " + REPLIES_TABLE
        + " (account_id, message_id, author, mode, text, status, created_at)"
        + " VALUES (:account_id, :message_id, 'user', 'manual', :text, 'sent', :created_at)",
        {
            "account_id": account["id"],
            "message_id": message_id,
            "text": text,
            "created_at": _to_mysql_dt(answer_date),
        })


def backfill_tn_shipments(account, dry_run=True):
    """Backfill de envíos TiendaNube: pagina /orders -> tiendanube.shipments.

    PULL + upsert SIN efectos secundarios: solo proyecta el contexto de envío
    de cada orden (`record_tn_shipment`); NO toca stock, NO notifica, NO
    responde IA. Idempotente por (account_id, order_id). Reusable para
    cualquier cuenta/business.
    """
    from app.integrations.core.order_records import record_tn_shipment
    from app.integrations.tiendanube.orders import fetch_orders_page

    fetched = written = 0
    errors = []
    page = 1
    while True:
        try:
            orders = fetch_orders_page(account, page=page, per_page=200)
        except Exception as exc:
            errors.append("orders page=%s: %s" % (page, exc))
            break
        if not orders:
            break
        for order in orders:
            fetched += 1
            if dry_run:
                continue
            try:
                record_tn_shipment(account, str(order.get("id")), order)
                written += 1
            except Exception as exc:
                errors.append("order %s: %s" % (order.get("id"), exc))
        if len(orders) < 200:
            break
        page += 1
    return {"fetched": fetched, "written": written, "errors": errors}


def _to_mysql_dt(value):
    """ISO del canal -> 'YYYY-MM-DD HH:MM:SS' (UTC, naive) para TIMESTAMP."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%d %H:%M:%S")
