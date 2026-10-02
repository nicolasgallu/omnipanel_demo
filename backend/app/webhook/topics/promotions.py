"""Topic handlers: public_offers / public_candidates -> mercadolibre.promotions.

Cada handler recibe el account resuelto y la notificación cruda. Busca el
recurso real en la API de Meli (nunca confiar en el payload) y hace upsert de
una proyección plana. Nunca lanzan excepciones hacia el dispatcher; los fallos
se loguean y la fila del inbox queda como red de seguridad.
"""
import json

from app.db.helpers import execute
from app.integrations.core.credentials import get_access_token
from app.integrations.mercadolibre.product_handler import _meli_request
from app.utils.logger import logger

PROMOTIONS_TABLE = "mercadolibre.promotions"
MELI_BASE_URL = "https://api.mercadolibre.com"


def handle_offer(account, data):
    """Topic 'public_offers' (ofertas de promociones)."""
    resource = data.get("resource") or ""
    external_id = resource.rstrip("/").split("/")[-1]
    if not external_id:
        return
    payload = _fetch(account, "offer", external_id)
    if payload is None:
        return
    _upsert(account, external_id, "offer", payload)


def handle_candidate(account, data):
    """Topic 'public_candidates' (candidatos de promociones)."""
    resource = data.get("resource") or ""
    external_id = resource.rstrip("/").split("/")[-1]
    if not external_id:
        return
    payload = _fetch(account, "candidate", external_id)
    if payload is None:
        return
    _upsert(account, external_id, "candidate", payload)


def _fetch(account, kind, external_id):
    token = get_access_token(account["id"]).get("access_token")
    path = "offers" if kind == "offer" else "candidates"
    url = MELI_BASE_URL + "/seller-promotions/" + path + "/" + external_id
    # Doc oficial (central-de-promociones): la llamada usa app_version=v2.
    try:
        response = _meli_request("GET", url, token,
                                 params={"app_version": "v2"}, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        logger.warning("Could not fetch Meli promotion %s %s: %s", kind, external_id, exc)
        return None


def _upsert(account, external_id, kind, payload):
    raw_item = payload.get("item_id") or payload.get("item")
    item_id = str(raw_item) if raw_item else None
    # Doc oficial (central-de-promociones): status es un objeto {"id": ...}
    # (offers: ACTIVE/programmed/inactive; candidates: candidate).
    raw_status = payload.get("status")
    status = raw_status.get("id") if isinstance(raw_status, dict) else raw_status
    status = str(status) if status else None

    execute(
        "INSERT INTO " + PROMOTIONS_TABLE
        + " (account_id, kind, external_id, item_id, status, data)"
        + " VALUES (:account_id, :kind, :external_id, :item_id, :status, :data)"
        + " ON DUPLICATE KEY UPDATE item_id = VALUES(item_id), status = VALUES(status),"
        + " data = VALUES(data), updated_at = NOW()",
        {
            "account_id": account["id"],
            "kind": kind,
            "external_id": str(external_id),
            "item_id": item_id,
            "status": status,
            "data": json.dumps(payload, ensure_ascii=False),
        },
    )
    logger.info("Stored Meli promotion %s %s", kind, external_id)
