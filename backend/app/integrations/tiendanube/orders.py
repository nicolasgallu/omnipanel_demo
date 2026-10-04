import requests
from app.integrations.core.credentials import get_access_token

BASE_URL = "https://api.tiendanube.com/v1"
USER_AGENT = "melirevamp-tiendanube/1.0"


def fetch_order(account, order_id):
    """Fetch one order from Tiendanube and cast its prices/quantities.

    Pide el aggregate oficial `fulfillment_orders` (doc del Order resource:
    https://tiendanube.github.io/api-documentation/resources/order — devuelve
    el detalle de los Fulfillment Orders: status, carrier, tracking_info.url,
    destination), que alimenta `data` de tiendanube.shipments. Si la API
    rechaza el parámetro (versión vieja o tienda sin fulfillment), reintenta
    SIN él: el webhook de órdenes no debe caerse por un aggregate opcional.

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
    response = requests.get(url, headers=headers,
                            params={"aggregates": "fulfillment_orders"}, timeout=60)
    if response.status_code >= 400:
        # Fallback sin aggregates: el envío igual se registra con los campos
        # planos (shipping_status, shipping_address, tracking, etc.).
        response = requests.get(url, headers=headers, timeout=60)
    response.raise_for_status()
    order = response.json()
    return _cast_products(order)


def fetch_orders_page(account, page=1, per_page=200):
    """Fetch one page of the store's orders (paginated by `page`).

    Returns a list of orders (already price/quantity-cast). Raises on non-2xx.
    Doc: https://dev.tiendanube.com/en/docs/erp-guide/orders/management
    """
    token = get_access_token(account["id"]).get("access_token")
    if not token:
        raise Exception("Missing access token for account " + str(account["id"]))
    store_id = account["external_account_id"]
    url = "{0}/{1}/orders".format(BASE_URL, store_id)
    headers = {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }
    response = requests.get(url, headers=headers,
                            params={"per_page": per_page, "page": page}, timeout=60)
    response.raise_for_status()
    orders = response.json()
    return [_cast_products(o) for o in orders]


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