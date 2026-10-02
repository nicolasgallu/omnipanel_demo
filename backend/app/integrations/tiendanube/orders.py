import requests
from app.integrations.core.credentials import get_access_token

BASE_URL = "https://api.tiendanube.com/v1"
USER_AGENT = "melirevamp-tiendanube/1.0"


def fetch_order(account, order_id):
    """Fetch one order from Tiendanube and cast its prices/quantities.

    Raises on any non-2xx (the webhook turns that into a 500 retry).
    """
    token = get_access_token(account["id"]).get("access_token")
    if not token:
        raise Exception("Missing access token for account " + str(account["id"]))
    store_id = account["external_account_id"]
    url = "{0}/{1}/orders/{2}".format(BASE_URL, store_id, order_id)
    headers = {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }
    response = requests.get(url, headers=headers, timeout=60)
    response.raise_for_status()
    order = response.json()
    return _cast_products(order)


def derive_event_type(order, trigger="paid"):
    """Map payment_status/status to our claim key.

    `trigger` = cuándo el business descuenta stock (config global):
    - "paid" (default): solo cuando el pago está capturado.
    - "confirmed": descuenta desde que la orden se abre en TiendaNube.
    La reversa se evalúa SIEMPRE primero.
    Returns 'order_paid', 'order_cancelled', or None (not actionable).
    """
    payment_status = order.get("payment_status")
    status = order.get("status")

    # Voided/refunded, or cancelled -> reversal (siempre).
    if payment_status in ("voided", "refunded") or status == "cancelled":
        return "order_cancelled"

    # Sale: pagada, o (trigger confirmed) orden abierta.
    if payment_status == "paid" or (trigger == "confirmed" and status == "open"):
        return "order_paid"

    # Anything else (pending/authorized/...) -> not actionable.
    return None


def _cast_products(order):
    # Tiendanube returns price/quantity as strings; cast here so the
    # selling pipeline never sees strings.
    for product in order.get("products") or []:
        product["price"] = _to_number(product.get("price"))
        product["quantity"] = _to_number(product.get("quantity"))
    return order


def _to_number(value):
    if value is None or isinstance(value, (int, float)):
        return value
    try:
        return int(value)
    except (TypeError, ValueError):
        pass
    try:
        return float(value)
    except (TypeError, ValueError):
        return value