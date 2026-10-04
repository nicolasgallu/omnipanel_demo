"""Normalización y registro de órdenes (MercadoLibre + TiendaNube).

Convierte el payload de cada plataforma a columnas normalizadas de la tabla
`<plataforma>.orders` y mantiene el track de estados (`status_history`)
append-only EN la propia fila de la orden.

Reglas:
- La columna `status` (máquina interna de stock de `sells.py`) NO se toca acá:
  `record_order` registra el estado REAL del canal; la máquina sigue con lo suyo.
- Append idempotente por `key` del último evento: un re-delivery del mismo
  estado no agrega nada. Es read-modify-write: los re-deliveries convergen
  porque cada uno re-lee la fila antes de escribir (y el payload re-fetch-eado
  tiene el mismo estado).
- Los campos ausentes del payload quedan NULL (nunca crashear).
"""
import json
from datetime import datetime, timezone

from app.db.helpers import execute, get_one
from app.settings.config import SCHEMA_MERCADOLIBRE, SCHEMA_TIENDANUBE

MELI_ORDERS = SCHEMA_MERCADOLIBRE + ".orders"
TNUDE_ORDERS = SCHEMA_TIENDANUBE + ".orders"
TN_SHIPMENTS = SCHEMA_TIENDANUBE + ".shipments"

# Estados normalizados del panel de ventas.
STATUS_PENDING_PAYMENT = "pending_payment"
STATUS_PAID = "paid"
STATUS_DELIVERED = "delivered"
STATUS_CANCELLED = "cancelled"


def normalize_status(platform, channel_status, payment_status=None):
    """Estado crudo del canal -> estado normalizado del panel."""
    if platform == "tiendanube":
        # La reversa siempre primero: cancelada o dinero devuelto.
        if channel_status == "cancelled" or payment_status in ("voided", "refunded"):
            return STATUS_CANCELLED
        if channel_status == "closed":
            return STATUS_DELIVERED
        if channel_status == "open":
            if payment_status == "paid":
                return STATUS_PAID
            return STATUS_PENDING_PAYMENT
        return None

    # mercadolibre
    if channel_status == "cancelled":
        return STATUS_CANCELLED
    if channel_status == "paid":
        return STATUS_PAID
    if channel_status in ("confirmed", "payment_required", "payment_in_process"):
        return STATUS_PENDING_PAYMENT
    return None


def normalize_order(platform, order):
    """Payload de la plataforma -> dict con las columnas normalizadas."""
    order = order or {}
    if platform == "tiendanube":
        return _normalize_tnube(order)
    return _normalize_meli(order)


def _normalize_meli(order):
    buyer = order.get("buyer") or {}
    buyer_name = buyer.get("nickname")
    if not buyer_name:
        parts = [p for p in (buyer.get("first_name"), buyer.get("last_name")) if p]
        buyer_name = " ".join(parts) if parts else None

    items = []
    for oi in order.get("order_items") or []:
        item = oi.get("item") or {}
        title = item.get("title")
        if not title and item.get("id"):
            title = "#" + str(item.get("id"))
        items.append(_line_item(
            sku=item.get("seller_sku"),
            title=title,
            quantity=oi.get("quantity"),
            unit_price=oi.get("unit_price"),
        ))

    return {
        "channel_status": order.get("status"),
        "payment_status": None,
        "buyer_name": buyer_name,
        "buyer_external_id": str(buyer["id"]) if buyer.get("id") is not None else None,
        "total": order.get("total_amount"),
        "currency": order.get("currency_id"),
        "date_created": order.get("date_created"),
        "link": None,
        "pack_id": str(order["pack_id"]) if order.get("pack_id") is not None else None,
        "items": items,
    }


def _normalize_tnube(order):
    customer = order.get("customer") or {}

    items = []
    for p in order.get("products") or []:
        items.append(_line_item(
            sku=p.get("sku"),
            title=p.get("name") or p.get("product_name"),
            quantity=p.get("quantity"),
            unit_price=p.get("price"),
        ))

    return {
        "channel_status": order.get("status"),
        "payment_status": order.get("payment_status"),
        "buyer_name": customer.get("name"),
        "buyer_external_id": str(customer["id"]) if customer.get("id") is not None else None,
        "total": order.get("total"),
        "currency": order.get("currency"),
        "date_created": order.get("created_at"),
        "link": None,
        "pack_id": None,
        "items": items,
    }


def _line_item(sku, title, quantity, unit_price):
    total = None
    if quantity is not None and unit_price is not None:
        try:
            total = quantity * unit_price
        except TypeError:
            total = None
    return {
        "sku": sku,
        "title": title,
        "quantity": quantity,
        "unit_price": unit_price,
        "total": total,
    }


def history_event(platform, normalized, order):
    """Evento de status_history para el estado actual de la orden."""
    raw = normalized.get("channel_status")
    payment_status = normalized.get("payment_status")
    key = raw
    if platform == "tiendanube" and payment_status:
        key = "%s|%s" % (raw, payment_status)

    at = None
    for field in ("date_created", "last_updated", "updated_at", "created_at"):
        at = (order or {}).get(field)
        if at:
            break
    if not at:
        at = datetime.utcnow().isoformat()

    return {
        "key": key,
        "status": normalize_status(platform, raw, payment_status),
        "raw": raw,
        "payment_status": payment_status,
        "at": at,
    }


def append_status_history(current, event):
    """Devuelve la lista de eventos con `event` agregado solo si cambió el key.

    Acepta None / JSON string / lista. Dedup contra el ÚLTIMO evento.
    """
    history = _parse_history(current)
    if history and history[-1].get("key") == event.get("key"):
        return history
    history.append(event)
    return history


def _parse_history(current):
    if isinstance(current, list):
        return current
    if isinstance(current, str) and current:
        try:
            parsed = json.loads(current)
        except (TypeError, ValueError):
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def record_order(account, platform, order_id, order):
    """Upsert de la orden con el estado REAL del canal + historia de estados.

    NUNCA escribe la columna `status`: esa pertenece a la máquina de stock de
    `sells.py` (sale/reversa) y conviven en columnas separadas.
    """
    table = TNUDE_ORDERS if platform == "tiendanube" else MELI_ORDERS
    normalized = normalize_order(platform, order)
    event = history_event(platform, normalized, order)

    history = []
    try:
        row = get_one(
            "SELECT status_history FROM " + table
            + " WHERE account_id = :aid AND order_id = :oid",
            {"aid": account["id"], "oid": str(order_id)})
        history = append_status_history(row.get("status_history"), event)
    except LookupError:
        history = append_status_history(None, event)

    values = {
        "order_id": str(order_id),
        "account_id": account["id"],
        "channel_status": normalized.get("channel_status"),
        "payment_status": normalized.get("payment_status"),
        "buyer_name": normalized.get("buyer_name"),
        "buyer_external_id": normalized.get("buyer_external_id"),
        "total": _to_number(normalized.get("total")),
        "currency": normalized.get("currency"),
        "date_created": _to_mysql_dt(normalized.get("date_created")),
        "link": normalized.get("link"),
        "pack_id": normalized.get("pack_id"),
        "data": json.dumps(normalized["items"], ensure_ascii=False),
        "status_history": json.dumps(history, ensure_ascii=False),
    }

    columns = ("order_id", "account_id", "channel_status",
               "buyer_name", "buyer_external_id", "total", "currency",
               "date_created", "link", "pack_id", "data", "status_history")
    if platform == "tiendanube":
        columns = ("order_id", "account_id", "channel_status", "payment_status",
                   "buyer_name", "buyer_external_id", "total", "currency",
                   "date_created", "link", "pack_id", "data", "status_history")

    placeholders = ", ".join(":" + c for c in columns)
    updates = ", ".join(
        "%s = VALUES(%s)" % (c, c) for c in columns
        if c not in ("order_id", "account_id"))
    execute(
        "INSERT INTO " + table + " (" + ", ".join(columns) + ")"
        + " VALUES (" + placeholders + ")"
        + " ON DUPLICATE KEY UPDATE " + updates,
        values)

    # Tienda Nube: el envío vive DENTRO de la orden (1:1, no hay recurso
    # shipments aparte como en Meli) — proyectarlo a tiendanube.shipments
    # para el panel unificado de Envíos. Best-effort: un fallo acá no debe
    # romper el registro de la orden.
    if platform == "tiendanube":
        record_tn_shipment(account, order_id, order)


# ─── Tienda Nube: proyección de envíos (tiendanube.shipments) ──────────────────
#
# Doc oficial del Order resource de Tiendanube (Nuvemshop API):
# https://tiendanube.github.io/api-documentation/resources/order
# - `shipping_status`: "unpacked" | "shipped" (fulfilled) | "unshipped"
#   (unfulfilled) | "delivered" | "partially_packed" | "partially_fulfilled".
# - Campos planos: shipping_pickup_type (ship|pickup), shipping (enum
#   branch|table|not-provided), shipping_option (nombre legible),
#   shipping_tracking_number, shipping_cost_customer/owner, shipping_min/max_days,
#   shipping_address {address, number, floor, locality, city, province, zipcode,
#   country, phone, name, ...}.
# - Con `?aggregates=fulfillment_orders` llega además `fulfillments`
#   (o `fulfillment_orders`): detalle por paquete con status, carrier,
#   tracking_info{url,code}, destination, labels.

# Enumerado de estado POR FILA del panel de Envíos (contrato final del Figma,
# 04/10): ML guarda su `status` crudo tal cual; TN mapea su `shipping_status`
# a este mismo enumerado al guardar. Los GRUPOS (to_prepare|in_transit|
# delivered|not_delivered|cancelled) para filtros/métricas se calculan en la
# API con un CASE sobre estos valores (pending+handling → to_prepare;
# ready_to_ship+shipped → in_transit; delivered; not_delivered; cancelled).

_TN_SHIPPING_STATUS_PENDING = ("unpacked",)
_TN_SHIPPING_STATUS_HANDLING = ("unshipped", "partially_packed")
_TN_SHIPPING_STATUS_SHIPPED = ("shipped", "partially_fulfilled")


def normalize_tn_shipment_status(order):
    """order.status/shipping_status -> estado POR FILA del panel de Envíos.

    Equivalencia TN (propuesta del usuario, confirmada contra la doc del
    Order resource): unpacked -> pending; unshipped/partially_packed ->
    handling; shipped/partially_fulfilled -> shipped; delivered -> delivered;
    order cancelada -> cancelled (la reversa SIEMPRE primero). TN no expone
    "falla del carrier", así que not_delivered nunca lo produce (solo ML).

    Fallback para payloads viejos sin shipping_status: closed -> delivered;
    open con tracking -> shipped; open sin tracking -> pending.
    """
    order = order or {}
    if order.get("status") == "cancelled":
        return "cancelled"
    shipping_status = order.get("shipping_status")
    if shipping_status in _TN_SHIPPING_STATUS_PENDING:
        return "pending"
    if shipping_status in _TN_SHIPPING_STATUS_HANDLING:
        return "handling"
    if shipping_status in _TN_SHIPPING_STATUS_SHIPPED:
        return "shipped"
    if shipping_status == "delivered":
        return "delivered"
    if order.get("status") == "closed":
        return "delivered"
    if order.get("status") == "open":
        if order.get("shipping_tracking_number"):
            return "shipped"
        return "pending"
    return None


def tn_shipment_context(order):
    """Contexto de envío de la orden TN: lo que se guarda en `data` de la fila.

    Solo campos de envío (nunca el payload completo de la orden): el resto ya
    vive en tiendanube.orders. `fulfillments` trae el detalle por paquete
    cuando el fetch pide aggregates=fulfillment_orders (tracking_info.url).
    """
    order = order or {}
    return {
        "shipping_status": order.get("shipping_status"),
        "shipping_pickup_type": order.get("shipping_pickup_type"),
        "shipping": order.get("shipping"),
        "shipping_option": order.get("shipping_option"),
        "shipping_tracking_number": order.get("shipping_tracking_number"),
        "shipping_cost_customer": order.get("shipping_cost_customer"),
        "shipping_cost_owner": order.get("shipping_cost_owner"),
        "shipping_min_days": order.get("shipping_min_days"),
        "shipping_max_days": order.get("shipping_max_days"),
        "shipping_address": order.get("shipping_address"),
        "fulfillments": order.get("fulfillments") or order.get("fulfillment_orders"),
    }


def record_tn_shipment(account, order_id, order):
    """Upsert de la fila de envío (1:1 con la orden) en tiendanube.shipments.

    `status` guarda el estado POR FILA del panel (enumerado único con ML:
    pending|handling|ready_to_ship|shipped|delivered|not_delivered|cancelled)
    — el crudo `shipping_status` queda en `data`. El mapeo se decide acá, una
    vez, al guardar (el order.status crudo es ambiguo para una vista de
    envíos). Idempotente por (account_id, order_id).
    """
    status = normalize_tn_shipment_status(order)
    if status is None:
        return
    execute(
        "INSERT INTO " + TN_SHIPMENTS
        + " (account_id, order_id, status, data)"
        + " VALUES (:account_id, :order_id, :status, :data)"
        + " ON DUPLICATE KEY UPDATE status = VALUES(status),"
        + " data = VALUES(data), updated_at = NOW()",
        {
            "account_id": account["id"],
            "order_id": str(order_id),
            "status": status,
            "data": json.dumps(tn_shipment_context(order), ensure_ascii=False),
        },
    )


def _to_number(value):
    if value is None or isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    return None


def _to_mysql_dt(value):
    """ISO string del canal -> 'YYYY-MM-DD HH:MM:SS' (UTC, naive) para TIMESTAMP."""
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%d %H:%M:%S")
