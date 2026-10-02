"""REST API del panel de ventas: órdenes unificadas (MercadoLibre + TiendaNube).

- GET /api/sales/orders                       -> listado paginado + counts
- GET /api/sales/orders/<platform>/<order_id> -> detalle
- GET /api/sales/report?days=7|30|90&channel= -> reporte de la vista Reportes

Scoping SIEMPRE por business_id a través de las cuentas del negocio
(platform_accounts.accounts). Solo usuarios business (sección Ventas).

Contrato del panel (spec del usuario):
  GET /api/sales/orders?channel=all|ml|tn&status=all|pending_payment|paid|
    delivered|cancelled&q=&page=0&page_size=50
  -> {items, total, page, page_size, counts:{total, pending_payment, paid,
      delivered, cancelled}}
  - `counts` (métricas) NO respeta el filtro de estado; `total` (paginación) SÍ.
  - Cada item trae `items` (con `stock_transactions` por ítem) + `history`
    embebidos: el drawer no necesita el endpoint de detalle.
"""
import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, request

from app.api.auth_utils import current_business_id, require_auth, require_business
from app.api.inventory import _serializable
from app.db.helpers import get_all, get_one
from app.integrations.core.order_records import normalize_status
from app.settings.config import (
    SCHEMA_ACCOUNTS,
    SCHEMA_INVENTORY,
    SCHEMA_MERCADOLIBRE,
    SCHEMA_TIENDANUBE,
)
from app.utils.logger import logger

sales_bp = Blueprint("sales_api", __name__, url_prefix="/api")

ACCOUNTS_TABLE = SCHEMA_ACCOUNTS + ".accounts"
CREDENTIALS_TABLE = SCHEMA_ACCOUNTS + ".credentials"
ML_ORDERS_TABLE = SCHEMA_MERCADOLIBRE + ".orders"
TN_ORDERS_TABLE = SCHEMA_TIENDANUBE + ".orders"
PRODUCTS_TABLE = SCHEMA_INVENTORY + ".products"
MOVEMENTS_TABLE = SCHEMA_INVENTORY + ".stock_movements"

CHANNEL_KEY = {"mercadolibre": "ml", "tiendanube": "tn"}
STATUS_VALUES = ("pending_payment", "paid", "delivered", "cancelled")

# Mapeo crudo -> normalizado en SQL (mismo criterio que normalize_status).
_ML_STATUS_NORM_SQL = (
    "CASE"
    " WHEN o.channel_status IN ('confirmed','payment_required','payment_in_process')"
    "   THEN 'pending_payment'"
    " WHEN o.channel_status = 'paid' THEN 'paid'"
    " WHEN o.channel_status = 'cancelled' THEN 'cancelled'"
    " ELSE NULL END"
)

# TN: la reversa SIEMPRE primero; después closed/paid/open.
_TN_STATUS_NORM_SQL = (
    "CASE"
    " WHEN o.channel_status = 'cancelled'"
    "   OR o.payment_status IN ('voided','refunded') THEN 'cancelled'"
    " WHEN o.channel_status = 'closed' THEN 'delivered'"
    " WHEN o.channel_status = 'open' AND o.payment_status = 'paid' THEN 'paid'"
    " WHEN o.channel_status = 'open' THEN 'pending_payment'"
    " ELSE NULL END"
)


# ─── helpers ──────────────────────────────────────────────────────────────────

def _not_found():
    return jsonify({"error": "not_found", "message": "Orden no encontrada"}), 404


def _in_clause(prefix, ids):
    return ",".join(":%s%d" % (prefix, i) for i in range(len(ids)))


def _in_params(prefix, ids):
    return {"%s%d" % (prefix, i): ids[i] for i in range(len(ids))}


def _parse_items(data):
    """`data` (JSON string de items) -> lista de dicts. Nunca crashea."""
    if data is None:
        return []
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except (TypeError, ValueError):
            return []
    if isinstance(data, dict):
        # Filas viejas pueden guardar el payload crudo; buscar la lista de items.
        data = next((data.get(k) for k in ("items", "order_items", "products")
                     if isinstance(data.get(k), list)), [])
    if not isinstance(data, list):
        return []
    return [it for it in data if isinstance(it, dict)]


def _parse_history(raw):
    """status_history (JSON) -> lista de eventos."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str) and raw:
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def _order_key(account_id, order_id):
    return (account_id, str(order_id))


def _sync_state(movements):
    """Estado general de sync de una orden a partir de sus movements.

    Reglas (spec): sin movimientos -> not_applicable; alguno en error
    (failed/failed_ambiguous) -> error; si no, alguno en cola (attempting)
    -> pending; si no, synced (ventas y devoluciones posteadas = el inventario
    quedó consistente con la orden; ya no existe el estado "reverted").
    """
    if not movements:
        return "not_applicable"
    has_attempting = False
    for m in movements:
        status = m.get("status")
        if status in ("failed", "failed_ambiguous"):
            return "error"
        if status == "attempting":
            has_attempting = True
    if has_attempting:
        return "pending"
    return "synced"


def _movement_dict(m):
    return {
        "direction": m.get("direction"),
        "quantity": int(m.get("quantity") or 0),
        "unit_price": _serializable(m.get("unit_price")),
        "status": m.get("status"),
        "provider_doc_id": m.get("provider_doc_id"),
        "error_message": m.get("error_message"),
        "created_at": _serializable(m.get("created_at")),
    }


def _orders_union(ml_ids, tn_ids):
    """UNION ALL de ambas tablas + `status_norm` por rama. Devuelve (sql, params)."""
    branches = []
    params = {}
    if ml_ids:
        branches.append(
            "SELECT o.order_id, 'mercadolibre' AS platform, o.account_id,"
            " o.channel_status, NULL AS payment_status, o.status_history,"
            " o.date_created, o.updated_at, o.buyer_name, o.total, o.currency,"
            " o.link, o.data, o.created_at,"
            " " + _ML_STATUS_NORM_SQL + " AS status_norm"
            " FROM " + ML_ORDERS_TABLE + " o"
            " WHERE o.account_id IN (" + _in_clause("ml", ml_ids) + ")")
        params.update(_in_params("ml", ml_ids))
    if tn_ids:
        branches.append(
            "SELECT o.order_id, 'tiendanube' AS platform, o.account_id,"
            " o.channel_status, o.payment_status, o.status_history,"
            " o.date_created, o.updated_at, o.buyer_name, o.total, o.currency,"
            " o.link, o.data, o.created_at,"
            " " + _TN_STATUS_NORM_SQL + " AS status_norm"
            " FROM " + TN_ORDERS_TABLE + " o"
            " WHERE o.account_id IN (" + _in_clause("tn", tn_ids) + ")")
        params.update(_in_params("tn", tn_ids))
    return " UNION ALL ".join(branches), params


# Búsqueda por q (igual para página, total y counts).
_Q_FILTER = (
    " AND (:q = '' OR t.order_id LIKE :like_q"
    " OR t.buyer_name LIKE :like_q"
    " OR CAST(t.data AS CHAR) LIKE :like_q)"
)


def _tn_order_urls(tn_ids):
    """account_id -> host de credentials.url (para el link de la orden TN)."""
    if not tn_ids:
        return {}
    rows = get_all(
        "SELECT account_id, url FROM " + CREDENTIALS_TABLE
        + " WHERE account_id IN (" + _in_clause("c", tn_ids) + ")",
        _in_params("c", tn_ids))
    out = {}
    for r in rows:
        url = (r.get("url") or "").strip()
        if url:
            host = url.replace("https://", "").replace("http://", "").rstrip("/")
            out[r["account_id"]] = host
    return out


def _order_url(platform, order_id, tn_urls, account_id):
    if platform == "mercadolibre":
        return "https://www.mercadolibre.com.ar/ventas/%s/detalle" % order_id
    host = tn_urls.get(account_id)
    if not host:
        return None
    return "https://%s/admin/orders/%s" % (host, order_id)


def _sync_for_orders(rows):
    """Map (account_id, order_id) -> estado de sync para las filas dadas."""
    if not rows:
        return {}
    clauses = []
    params = {}
    for i, r in enumerate(rows):
        clauses.append("(:a%d, :o%d)" % (i, i))
        params["a%d" % i] = r["account_id"]
        params["o%d" % i] = str(r["order_id"])
    movements = get_all(
        "SELECT account_id, order_id, direction, status"
        " FROM " + MOVEMENTS_TABLE
        + " WHERE (account_id, order_id) IN (" + ",".join(clauses) + ")",
        params)
    by_order = {}
    for m in movements:
        by_order.setdefault(
            _order_key(m["account_id"], m["order_id"]), []).append(m)
    return {k: _sync_state(v) for k, v in by_order.items()}


def _transaction_dict(m):
    """Un movimiento de stock_movements -> transacción del ítem (spec)."""
    status = m.get("status")
    tx_status = ("synced" if status == "posted"
                 else "pending" if status == "attempting" else "error")
    return {
        "type": "return" if m.get("direction") == "reversal" else "sale",
        "status": tx_status,
        # El comprobante solo existe cuando el movimiento posteó.
        "document_number": m.get("provider_doc_id") if status == "posted" else None,
    }


def _stock_transactions_for_orders(rows):
    """(account_id, order_id, sku) -> [transacciones] para cada ítem.

    Un movimiento sale/return por transacción, en orden cronológico
    (venta primero y, si la orden se canceló, la devolución después).
    """
    out = {}
    if not rows:
        return out
    clauses = []
    params = {}
    for i, r in enumerate(rows):
        clauses.append("(:a%d, :o%d)" % (i, i))
        params["a%d" % i] = r["account_id"]
        params["o%d" % i] = str(r["order_id"])
    movements = get_all(
        "SELECT m.account_id, m.order_id, m.direction, m.status,"
        " m.provider_doc_id, p.sku"
        " FROM " + MOVEMENTS_TABLE + " m"
        " JOIN " + PRODUCTS_TABLE + " p ON p.id = m.product_id"
        " WHERE (m.account_id, m.order_id) IN (" + ",".join(clauses) + ")"
        + " ORDER BY m.id",
        params)
    for m in movements:
        if not m.get("sku"):
            continue
        key = (m["account_id"], str(m["order_id"]), m["sku"])
        out.setdefault(key, []).append(_transaction_dict(m))
    return out


def _order_item(row, account_name, tn_urls, sync_map, tx_map):
    """Dict de una orden (item del listado y `order` del detalle)."""
    platform = row["platform"]
    order_id = str(row["order_id"])
    account_id = row["account_id"]

    items = []
    for it in _parse_items(row.get("data")):
        items.append({
            "title": it.get("title") or "",
            "sku": it.get("sku"),
            "quantity": it.get("quantity") or 0,
            "unit_price": _serializable(it.get("unit_price")),
            "stock_transactions": tx_map.get(
                (account_id, order_id, it.get("sku")), []),
        })

    history = []
    for ev in _parse_history(row.get("status_history")):
        if not isinstance(ev, dict):
            continue
        ev_status = ev.get("status")
        if ev_status == "completed":  # valor viejo -> nombre nuevo
            ev_status = "delivered"
        raw_status = ev.get("raw")
        if platform == "tiendanube" and raw_status not in ("cancelled", "closed"):
            raw_status = ev.get("payment_status") or raw_status
        history.append({
            "at": ev.get("at"),
            "status": ev_status,
            "raw_status": raw_status,
        })

    status_norm = history[-1].get("status") if history else None
    if not status_norm:
        status_norm = row.get("status_norm")
    if not status_norm:
        status_norm = normalize_status(
            platform, row.get("channel_status"), row.get("payment_status"))

    return {
        "id": "%s-%s" % (platform, order_id),
        "number": order_id,
        "channel": CHANNEL_KEY.get(platform, platform),
        "created_at": _serializable(row.get("date_created")),
        "updated_at": _serializable(row.get("updated_at")),
        "buyer_name": row.get("buyer_name"),
        "currency": row.get("currency"),
        "total": _serializable(row.get("total")),
        "url": _order_url(platform, order_id, tn_urls, account_id),
        "status": status_norm,
        "stock_sync": sync_map.get(
            _order_key(account_id, order_id), "not_applicable"),
        "items": items,
        "history": history,
    }


# ─── endpoints ────────────────────────────────────────────────────────────────

@sales_bp.route("/sales/orders", methods=["GET"])
@require_auth
@require_business
def list_orders():
    channel = (request.args.get("channel") or "all").strip()
    status = (request.args.get("status") or "all").strip()
    q = (request.args.get("q") or "").strip()
    try:
        page = max(0, int(request.args.get("page") or 0))
        page_size = min(200, max(1, int(request.args.get("page_size") or 50)))
    except ValueError:
        return jsonify({"error": "bad_request",
                        "message": "Paginación inválida"}), 400

    business_id = current_business_id()
    zero_counts = {"total": 0, "pending_payment": 0, "paid": 0,
                   "delivered": 0, "cancelled": 0}

    # Cuentas del negocio (filtradas por canal si viene): la fuente de ownership.
    accounts_sql = ("SELECT id, platform, name FROM " + ACCOUNTS_TABLE
                    + " WHERE business_id = :b")
    accounts_params = {"b": business_id}
    if channel in ("ml", "tn"):
        accounts_sql += " AND platform = :platform"
        accounts_params["platform"] = ("mercadolibre" if channel == "ml"
                                       else "tiendanube")
    accounts = get_all(accounts_sql, accounts_params)
    if not accounts:
        return jsonify({"items": [], "total": 0, "page": page,
                        "page_size": page_size, "counts": zero_counts})

    ml_ids = [a["id"] for a in accounts if a["platform"] == "mercadolibre"]
    tn_ids = [a["id"] for a in accounts if a["platform"] == "tiendanube"]
    union, union_params = _orders_union(ml_ids, tn_ids)
    if not union:
        return jsonify({"items": [], "total": 0, "page": page,
                        "page_size": page_size, "counts": zero_counts})

    # `status` filtra SOLO la página y el total (paginación); counts no.
    status_filter = ""
    base_params = dict(union_params, q=q, like_q="%" + q + "%")
    if status in STATUS_VALUES:
        status_filter = " AND t.status_norm = :status"
        base_params["status"] = status

    rows = get_all(
        "SELECT t.* FROM (" + union + ") t WHERE 1=1" + _Q_FILTER + status_filter
        + " ORDER BY COALESCE(t.date_created, t.updated_at, t.created_at) DESC,"
        + " t.order_id DESC LIMIT :limit OFFSET :offset",
        dict(base_params, limit=page_size, offset=page * page_size))

    total_row = get_one(
        "SELECT COUNT(*) AS n FROM (" + union + ") t WHERE 1=1"
        + _Q_FILTER + status_filter,
        base_params)
    total = int(total_row["n"] or 0)

    counts_row = get_one(
        "SELECT COUNT(*) AS total,"
        " SUM(CASE WHEN t.status_norm = 'pending_payment' THEN 1 ELSE 0 END)"
        "   AS pending_payment,"
        " SUM(CASE WHEN t.status_norm = 'paid' THEN 1 ELSE 0 END) AS paid,"
        " SUM(CASE WHEN t.status_norm = 'delivered' THEN 1 ELSE 0 END) AS delivered,"
        " SUM(CASE WHEN t.status_norm = 'cancelled' THEN 1 ELSE 0 END) AS cancelled"
        " FROM (" + union + ") t WHERE 1=1" + _Q_FILTER,
        base_params)
    counts = {k: int(counts_row[k] or 0)
              for k in ("total", "pending_payment", "paid", "delivered", "cancelled")}

    account_names = {a["id"]: a["name"] for a in accounts}
    tn_urls = _tn_order_urls(tn_ids)
    sync_map = _sync_for_orders(rows)
    tx_map = _stock_transactions_for_orders(rows)

    items = [_order_item(r, account_names.get(r["account_id"]),
                         tn_urls, sync_map, tx_map) for r in rows]

    logger.info("sales/orders channel=%s status=%s q=%s page=%s total=%s",
                channel or "-", status or "-", q or "-", page, total)
    return jsonify({"items": items, "total": total, "page": page,
                    "page_size": page_size, "counts": counts})


@sales_bp.route("/sales/orders/<platform>/<order_id>", methods=["GET"])
@require_auth
@require_business
def get_order(platform, order_id):
    if platform not in ("mercadolibre", "tiendanube"):
        return _not_found()

    business_id = current_business_id()
    params = {"b": business_id, "oid": str(order_id)}

    # Ownership via JOIN con las cuentas del negocio (mismo patrón que el listado).
    if platform == "tiendanube":
        sql = (
            "SELECT o.order_id, o.account_id, o.channel_status, o.payment_status,"
            " o.status_history, o.buyer_name, o.total, o.currency, o.date_created,"
            " o.updated_at, o.link, o.data, o.created_at, a.name AS account_name"
            " FROM " + TN_ORDERS_TABLE + " o"
            " JOIN " + ACCOUNTS_TABLE + " a ON a.id = o.account_id AND a.business_id = :b"
            " WHERE o.order_id = :oid")
    else:
        sql = (
            "SELECT o.order_id, o.account_id, o.channel_status,"
            " o.status_history, o.buyer_name, o.total, o.currency, o.date_created,"
            " o.updated_at, o.link, o.data, o.created_at, a.name AS account_name"
            " FROM " + ML_ORDERS_TABLE + " o"
            " JOIN " + ACCOUNTS_TABLE + " a ON a.id = o.account_id AND a.business_id = :b"
            " WHERE o.order_id = :oid")

    try:
        row = get_one(sql, params)
    except LookupError:
        return _not_found()

    row["platform"] = platform
    row["status_norm"] = None  # _order_item deriva de history/channel_status
    tn_urls = _tn_order_urls([row["account_id"]]) if platform == "tiendanube" else {}
    rows = [row]
    sync_map = _sync_for_orders(rows)
    tx_map = _stock_transactions_for_orders(rows)
    order = _order_item(row, row.get("account_name"), tn_urls, sync_map, tx_map)

    movements = get_all(
        "SELECT direction, quantity, unit_price, status, provider_doc_id,"
        " error_message, created_at"
        " FROM " + MOVEMENTS_TABLE
        + " WHERE account_id = :aid AND order_id = :oid"
        + " ORDER BY id",
        {"aid": row["account_id"], "oid": str(order_id)})

    return jsonify({
        "order": order,
        "stock_sync": {
            "state": order["stock_sync"],
            "movements": [_movement_dict(m) for m in movements],
        },
    })


# ─── reporte (vista Reportes) ─────────────────────────────────────────────────

REPORT_DAYS = (7, 30, 90)


@sales_bp.route("/sales/report", methods=["GET"])
@require_auth
@require_business
def sales_report():
    """Agregados del reporte: cards + serie diaria para el gráfico de líneas.

    GET /api/sales/report?days=7|30|90&channel=all|ml|tn
    Neto = órdenes NO canceladas. Los días se agrupan por la fecha de creación
    en la zona horaria de Argentina; la serie incluye TODOS los días del rango
    (los vacíos en 0). `by_channel` siempre viene completo (modo comparar).
    """
    try:
        days = int(request.args.get("days") or 30)
    except ValueError:
        days = 30
    if days not in REPORT_DAYS:
        days = 30
    channel = (request.args.get("channel") or "all").strip()

    ARG = ZoneInfo("America/Argentina/Buenos_Aires")
    today = datetime.now(ARG).date()
    start_date = today - timedelta(days=days - 1)
    utc_from = datetime.combine(start_date, datetime.min.time(), tzinfo=ARG) \
        .astimezone(timezone.utc).replace(tzinfo=None)
    utc_to = datetime.combine(today + timedelta(days=1), datetime.min.time(),
                              tzinfo=ARG).astimezone(timezone.utc) \
        .replace(tzinfo=None)

    business_id = current_business_id()
    accounts_sql = ("SELECT id, platform FROM " + ACCOUNTS_TABLE
                    + " WHERE business_id = :b")
    accounts_params = {"b": business_id}
    if channel in ("ml", "tn"):
        accounts_sql += " AND platform = :platform"
        accounts_params["platform"] = ("mercadolibre" if channel == "ml"
                                       else "tiendanube")
    accounts = get_all(accounts_sql, accounts_params)

    date_list = [start_date + timedelta(days=i) for i in range(days)]
    day_map = {
        d.isoformat(): {
            "date": d.isoformat(),
            "orders": 0,
            "net": 0.0,
            "by_channel": {"ml": {"orders": 0, "net": 0.0},
                           "tn": {"orders": 0, "net": 0.0}},
        }
        for d in date_list}

    cancelled_count = 0
    cancelled_amount = 0.0

    ml_ids = [a["id"] for a in accounts if a["platform"] == "mercadolibre"]
    tn_ids = [a["id"] for a in accounts if a["platform"] == "tiendanube"]
    union, union_params = _orders_union(ml_ids, tn_ids)

    if union:
        rows = get_all(
            "SELECT t.platform, t.total, t.status_norm,"
            " COALESCE(t.date_created, t.updated_at, t.created_at) AS day_ts"
            " FROM (" + union + ") t"
            " WHERE COALESCE(t.date_created, t.updated_at, t.created_at) >= :f"
            "   AND COALESCE(t.date_created, t.updated_at, t.created_at) < :t",
            dict(union_params, f=utc_from, t=utc_to))
        for r in rows:
            ts = r["day_ts"]
            if ts is None:
                continue
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            day = ts.astimezone(ARG).date().isoformat()
            amount = round(float(r["total"] or 0), 2)
            if r.get("status_norm") == "cancelled":
                cancelled_count += 1
                cancelled_amount += amount
                continue
            bucket = day_map.get(day)
            if bucket is None:
                continue
            bucket["orders"] += 1
            bucket["net"] = round(bucket["net"] + amount, 2)
            chan = CHANNEL_KEY.get(r["platform"], "ml")
            bucket["by_channel"][chan]["orders"] += 1
            bucket["by_channel"][chan]["net"] = round(
                bucket["by_channel"][chan]["net"] + amount, 2)

    days_out = [day_map[d.isoformat()] for d in date_list]
    net = round(sum(d["net"] for d in days_out), 2)
    orders = sum(d["orders"] for d in days_out)
    by_channel = {
        c: {
            "orders": sum(d["by_channel"][c]["orders"] for d in days_out),
            "net": round(sum(d["by_channel"][c]["net"] for d in days_out), 2),
        }
        for c in ("ml", "tn")
    }
    total_orders = orders + cancelled_count

    logger.info("sales/report days=%s channel=%s orders=%s net=%s",
                days, channel or "-", orders, net)
    return jsonify({
        "days": days_out,
        "net": net,
        "orders": orders,
        "orders_per_day": round(orders / days, 2),
        "avg_ticket": round(net / orders, 2) if orders else 0,
        "cancelled": {
            "count": cancelled_count,
            "amount": round(cancelled_amount, 2),
            "pct": round((cancelled_count / total_orders) * 100, 2)
                   if total_orders else 0,
        },
        "by_channel": by_channel,
    })
