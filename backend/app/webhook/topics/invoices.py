"""Manejador del topic 'invoices' (facturas) -> mercadolibre.invoices.

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

INVOICES_TABLE = "mercadolibre.invoices"
MELI_BASE_URL = "https://api.mercadolibre.com"


def handle(account, data):
    """Topic 'invoices' (facturas)."""
    token = get_access_token(account["id"]).get("access_token")
    resource = data.get("resource") or ""
    # /users/{user_id}/invoices/{id}
    parts = resource.rstrip("/").split("/")
    user_id = parts[-3] if len(parts) >= 3 else ""
    external_id = parts[-1]
    if not user_id or not external_id:
        return

    url = MELI_BASE_URL + "/users/" + user_id + "/invoices/" + external_id
    try:
        response = _meli_request("GET", url, token, timeout=30)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        logger.warning("Could not fetch Meli invoice %s: %s", external_id, exc)
        return

    # Doc oficial (descargar-facturas-mla): la factura NO trae order_id
    # top-level; la orden vive en items[].external_order_id.
    items = payload.get("items") or []
    first_item = items[0] if items and isinstance(items[0], dict) else {}
    order_raw = first_item.get("external_order_id")
    execute(
        "INSERT INTO " + INVOICES_TABLE
        + " (account_id, external_id, order_id, status, data)"
        + " VALUES (:account_id, :external_id, :order_id, :status, :data)"
        + " ON DUPLICATE KEY UPDATE order_id = VALUES(order_id), status = VALUES(status),"
        + " data = VALUES(data), updated_at = NOW()",
        {
            "account_id": account["id"],
            "external_id": str(external_id),
            "order_id": str(order_raw) if order_raw else None,
            "status": str(payload.get("status")) or None,
            "data": json.dumps(payload, ensure_ascii=False),
        },
    )
    logger.info("Stored Meli invoice %s", external_id)
