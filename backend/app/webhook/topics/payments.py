"""Manejador del topic 'payments' (pagos) -> mercadolibre.payments.

Recibe el account resuelto y la notificación cruda. Busca el recurso real en
la API de Meli (nunca confía en el payload) y hace upsert de una proyección
plana. Nunca lanza excepciones hacia el dispatcher; los fallos se registran en
el log y la fila del inbox queda como red de seguridad.
"""
import json

from app.db.helpers import execute
from app.integrations.core.credentials import get_access_token
from app.integrations.mercadolibre.product_handler import _meli_request
from app.utils.logger import logger

PAYMENTS_TABLE = "mercadolibre.payments"
MELI_BASE_URL = "https://api.mercadolibre.com"


def handle(account, data):
    """Topic 'payments' (pagos)."""
    token = get_access_token(account["id"]).get("access_token")
    resource = data.get("resource") or ""
    # /collections/{id}
    external_id = resource.rstrip("/").split("/")[-1]
    if not external_id:
        return

    url = MELI_BASE_URL + "/collections/" + external_id
    try:
        response = _meli_request("GET", url, token, timeout=30)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        logger.warning("Could not fetch Meli payment %s: %s", external_id, exc)
        return

    amount = None
    raw_amount = payload.get("transaction_amount")
    if raw_amount is not None:
        try:
            amount = float(raw_amount)
        except (TypeError, ValueError):
            amount = None

    execute(
        "INSERT INTO " + PAYMENTS_TABLE
        + " (account_id, external_id, order_id, status, amount, currency_id, data)"
        + " VALUES (:account_id, :external_id, :order_id, :status, :amount, :currency_id, :data)"
        + " ON DUPLICATE KEY UPDATE order_id = VALUES(order_id), status = VALUES(status),"
        + " amount = VALUES(amount), currency_id = VALUES(currency_id),"
        + " data = VALUES(data), updated_at = NOW()",
        {
            "account_id": account["id"],
            "external_id": str(external_id),
            "order_id": str(payload.get("order_id")) if payload.get("order_id") else None,
            "status": str(payload.get("status")) or None,
            "amount": amount,
            "currency_id": str(payload.get("currency_id")) if payload.get("currency_id") else None,
            "data": json.dumps(payload, ensure_ascii=False),
        },
    )
    logger.info("Stored Meli payment %s", external_id)
