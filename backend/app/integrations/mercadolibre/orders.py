import requests
from app.integrations.core.credentials import get_access_token

MELI_BASE_URL = "https://api.mercadolibre.com"

def fetch_order(account, order_id):
    """Fetch one order from MercadoLibre for the given account.

    Raises on any non-2xx (the webhook will turn that into a 500 retry).
    """
    token = get_access_token(account["id"]).get('access_token')
    if not token:
        raise Exception("Missing access token for account " + str(account["id"]))
    url = MELI_BASE_URL + "/orders/" + str(order_id)
    headers = {"Authorization": "Bearer " + token}
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()


def fetch_orders_page(account, offset=0, limit=50):
    """Fetch one page of the seller's orders from /orders/search.

    Returns (orders, total). Raises on any non-2xx.
    Doc: https://global-selling.mercadolibre.com/devsite/en_us/manage-orders-cbt/manage-orders-cbt
    """
    token = get_access_token(account["id"]).get("access_token")
    if not token:
        raise Exception("Missing access token for account " + str(account["id"]))
    url = MELI_BASE_URL + "/orders/search"
    headers = {"Authorization": "Bearer " + token}
    params = {
        "seller": str(account["external_account_id"]),
        "sort": "date_desc",
        "offset": offset,
        "limit": limit,
    }
    response = requests.get(url, headers=headers, params=params, timeout=30)
    response.raise_for_status()
    body = response.json()
    results = body.get("results") or []
    total = (body.get("paging") or {}).get("total", 0)
    return results, total


def derive_event_type(order, trigger="paid"):
    """Map the order's REAL status to our claim key.

    `trigger` = cuándo el business descuenta stock (config global):
    - "paid" (default): solo ventas pagadas.
    - "confirmed": descuenta desde que Meli confirma la orden.
    Returns 'order_paid', 'order_cancelled', or None (not actionable).
    """
    status = order.get("status")
    if status == "cancelled":
        return "order_cancelled"
    if status == "paid":
        return "order_paid"
    if trigger == "confirmed" and status == "confirmed":
        return "order_paid"
    return None