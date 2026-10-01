"""Topic handler: shipments -> mercadolibre.shipments.

Cada handler recibe el dict de la cuenta resuelta y la notificación cruda.
Busca el recurso real desde la API de Meli (nunca confiar en el payload) y
hace upsert de una proyección plana. Nunca levanta hacia el dispatcher; los
fallos se loguean y la fila de inbox queda como red de seguridad.
"""
import json

from app.db.helpers import execute, get_one
from app.integrations.core.credentials import get_access_token
from app.integrations.mercadolibre.product_handler import _meli_request
from app.integrations.mercadolibre.shipment_labels import (
    fetch_shipment_label_pdf,
    upload_label_to_gcs,
)
from app.service.notifications import notify_business
from app.utils.logger import logger

SHIPMENTS_TABLE = "mercadolibre.shipments"
MELI_BASE_URL = "https://api.mercadolibre.com"


def handle(account, data):
    """Topic 'shipments' (envíos de la orden)."""
    token = get_access_token(account["id"]).get("access_token")
    resource = data.get("resource") or ""
    external_id = resource.rstrip("/").split("/")[-1]
    if not external_id:
        return

    url = MELI_BASE_URL + "/shipments/" + external_id
    try:
        response = _meli_request("GET", url, token, timeout=30)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        logger.warning("Could not fetch Meli shipment %s: %s", external_id, exc)
        return

    order_id = str(payload.get("order_id")) if payload.get("order_id") else None
    status = str(payload.get("status") or payload.get("substatus")) or None

    # Estado anterior: solo notificamos transiciones REALES hacia 'delivered'
    # (un re-delivery de Meli con el mismo estado no duplica el mensaje).
    previous = None
    try:
        row = get_one(
            "SELECT status FROM " + SHIPMENTS_TABLE
            + " WHERE account_id = :account_id AND external_id = :external_id",
            {"account_id": account["id"], "external_id": str(external_id)})
        previous = row.get("status")
    except LookupError:
        pass

    execute(
        "INSERT INTO " + SHIPMENTS_TABLE
        + " (account_id, external_id, order_id, status, data)"
        + " VALUES (:account_id, :external_id, :order_id, :status, :data)"
        + " ON DUPLICATE KEY UPDATE order_id = VALUES(order_id), status = VALUES(status),"
        + " data = VALUES(data), updated_at = NOW()",
        {
            "account_id": account["id"],
            "external_id": str(external_id),
            "order_id": order_id,
            "status": status,
            "data": json.dumps(payload, ensure_ascii=False),
        },
    )
    logger.info("Stored Meli shipment %s", external_id)

    if previous != status and status == "delivered" and order_id:
        notify_business(
            account["business_id"], "order_delivered",
            {"platform": "MercadoLibre", "order_id": order_id})

    # ready_to_ship = la etiqueta queda disponible. Intentamos el PDF con
    # reintentos (Meli puede notificar el estado antes de terminar de
    # generarla); si no sale, aviso de texto con el nº de orden. Best-effort:
    # nunca rompe el upsert ni el ack del webhook.
    if previous != status and status == "ready_to_ship":
        pdf_url = None
        try:
            pdf_bytes = fetch_shipment_label_pdf(token, external_id, retries=3, delay=2)
            pdf_url = upload_label_to_gcs(external_id, pdf_bytes)
        except Exception as exc:
            logger.warning("Label not resolved for shipment %s (text fallback): %s",
                           external_id, exc)
        notify_business(
            account["business_id"], "label_ready",
            {"platform": "MercadoLibre",
             "shipment_id": str(external_id),
             "order_id": order_id,
             "document_url": pdf_url})
