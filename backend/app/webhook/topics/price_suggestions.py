"""Topic handlers: price_suggestion / catalog_item_competition_status -> mercadolibre.price_suggestions.

Cada handler recibe el account resuelto y la notificación cruda. Hacen el
fetch del recurso real a la API de Meli (nunca confiar en el payload) y
upsertean una proyección plana. Nunca lanzan excepciones hacia el dispatcher;
los fallos se loguean y la fila del inbox queda como red de seguridad.
"""
import json

from app import cache
from app.db.helpers import execute
from app.integrations.core.credentials import get_access_token
from app.integrations.mercadolibre.product_handler import _meli_request
from app.utils.logger import logger

PRICE_SUGGESTIONS_TABLE = "mercadolibre.price_suggestions"
MELI_BASE_URL = "https://api.mercadolibre.com"


def _as_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _first_numeric(values):
    for value in values:
        result = _as_float(value)
        if result is not None:
            return result
    return None


def _as_str(value):
    return str(value) if value else None


def _upsert(account, item_id, current_price, suggested_price, status, data):
    execute(
        "INSERT INTO " + PRICE_SUGGESTIONS_TABLE
        + " (account_id, item_id, current_price, suggested_price, status, data)"
        + " VALUES (:account_id, :item_id, :current_price, :suggested_price, :status, :data)"
        + " ON DUPLICATE KEY UPDATE current_price = VALUES(current_price),"
        + " suggested_price = VALUES(suggested_price), status = VALUES(status),"
        + " data = VALUES(data), updated_at = NOW()",
        {
            "account_id": account["id"],
            "item_id": str(item_id),
            "current_price": current_price,
            "suggested_price": suggested_price,
            "status": status,
            "data": data,
        },
    )
    # El precio sugerido viaja en las filas cacheadas de la vista ML:
    # invalidar DESPUÉS de la escritura (ver app/cache.py).
    cache.invalidate_business(account.get("business_id"))
    logger.info("Stored Meli price suggestion %s", item_id)


def _meli_item_id(parts):
    """Extrae el item id de Meli de los segmentos del resource.

    Los ids de Meli arrancan con "ML" (MLA123...); se busca el primer
    segmento con esa forma empezando por el final — funciona con y sin '/'
    inicial y con o sin sufijo '/details'.
    """
    for part in reversed(parts):
        if part and len(part) >= 4 and part[:2] == "ML":
            return part
    return None


def handle(account, data):
    """Topic 'price_suggestion'."""
    token = get_access_token(account["id"]).get("access_token")
    resource = data.get("resource") or ""
    # resource: /suggestions/items/MLA123456/details -> MLA123456
    item_id = _meli_item_id(resource.split("/"))
    if not item_id:
        return

    url = MELI_BASE_URL + "/suggestions/items/" + item_id + "/details"
    try:
        response = _meli_request("GET", url, token, timeout=30)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        logger.warning("Could not fetch Meli price suggestion %s: %s", item_id, exc)
        return

    suggested_price = _first_numeric(
        [payload.get("suggested_price"), payload.get("price"), payload.get("price_to_win")]
    )
    current_price = _as_float(payload.get("current_price"))
    status = _as_str(payload.get("status"))
    data = json.dumps(payload, ensure_ascii=False)
    _upsert(account, item_id, current_price, suggested_price, status, data)


def handle_competition(account, data):
    """Topic 'catalog_item_competition_status'."""
    token = get_access_token(account["id"]).get("access_token")
    resource = data.get("resource") or ""
    # resource: /items/MLA123/price_to_win -> MLA123
    item_id = _meli_item_id(resource.split("/"))
    if not item_id:
        return

    url = MELI_BASE_URL + "/items/" + item_id + "/price_to_win"
    try:
        response = _meli_request("GET", url, token, timeout=30)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        logger.warning("Could not fetch Meli price suggestion %s: %s", item_id, exc)
        return

    suggested_price = _first_numeric(
        [payload.get("price"), payload.get("price_to_win"), payload.get("winning_price")]
    )
    current_price = None
    status = _as_str(payload.get("status")) or _as_str(payload.get("competition_status"))
    data = json.dumps(payload, ensure_ascii=False)
    _upsert(account, item_id, current_price, suggested_price, status, data)
