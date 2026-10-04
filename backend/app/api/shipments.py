"""REST API del panel unificado de Envíos (MercadoLibre + TiendaNube).

- GET /api/shipments -> listado unificado + counts del strip.

Scoping SIEMPRE por business_id a través de las cuentas del negocio
(platform_accounts.accounts). Auth: @require_auth (empleados incluidos).

Contrato FINAL (Figma del usuario, 04/10 — spec en
backend/docs/shipments_panel_plan.md):
  GET /api/shipments?channel=all|ml|tn&status_group=all|to_prepare|
    in_transit|delivered|not_delivered|cancelled&q=&page=0&page_size=50
  -> {items, total, page, page_size,
      counts:{total, to_prepare, in_transit, delivered, incidents},
      account_total}

- Cada fila trae el estado POR FILA (enumerado único ML/TN):
  pending|handling|ready_to_ship|shipped|delivered|not_delivered|cancelled.
  ML lo guarda crudo; TN lo mapea de su shipping_status al guardar
  (order_records.normalize_tn_shipment_status). El `status_group` para
  filtros/métricas se calcula en SQL: pending+handling → to_prepare;
  ready_to_ship+shipped → in_transit; delivered; not_delivered; cancelled.
- `counts` (strip) NO respeta el filtro de status_group; `total` (paginación)
  SÍ. Ambos respetan channel y `q`. `account_total` = envíos de la cuenta sin
  NINGÚN filtro (estado vacío de la pantalla).
- `external_id`: ML = shipment id; TN = order_id (la orden ES el envío).
- `page` 0-based; `page_size` default 50, máx 200. Orden por last_updated desc.
"""
import json

from flask import Blueprint, jsonify, request

from app.api.auth_utils import current_business_id, require_auth
from app.api.inventory import _serializable
from app.db.helpers import get_all, get_one
from app.settings.config import (
    SCHEMA_ACCOUNTS,
    SCHEMA_MERCADOLIBRE,
    SCHEMA_TIENDANUBE,
)
from app.utils.logger import logger

shipments_bp = Blueprint("shipments_api", __name__, url_prefix="/api")

ACCOUNTS_TABLE = SCHEMA_ACCOUNTS + ".accounts"
ML_SHIPMENTS_TABLE = SCHEMA_MERCADOLIBRE + ".shipments"
TN_SHIPMENTS_TABLE = SCHEMA_TIENDANUBE + ".shipments"
TN_ORDERS_TABLE = SCHEMA_TIENDANUBE + ".orders"

CHANNEL_KEY = {"mercadolibre": "ml", "tiendanube": "tn"}
GROUP_VALUES = ("to_prepare", "in_transit", "delivered",
                "not_delivered", "cancelled")

# Estado por fila (enumerado único) -> grupo para filtros/métricas. Ambas
# tablas guardan este mismo enumerado (ML crudo, TN mapeado al guardar).
_STATUS_GROUP_SQL = (
    "CASE"
    " WHEN s.status IN ('pending','handling') THEN 'to_prepare'"
    " WHEN s.status IN ('ready_to_ship','shipped') THEN 'in_transit'"
    " WHEN s.status = 'delivered' THEN 'delivered'"
    " WHEN s.status = 'not_delivered' THEN 'not_delivered'"
    " WHEN s.status = 'cancelled' THEN 'cancelled'"
    " ELSE NULL END"
)


# ─── helpers ──────────────────────────────────────────────────────────────────

def _in_clause(prefix, ids):
    return ",".join(":%s%d" % (prefix, i) for i in range(len(ids)))


def _in_params(prefix, ids):
    return {"%s%d" % (prefix, i): ids[i] for i in range(len(ids))}


def _json_load(value):
    if value is None:
        return {}
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return {}


def _shipments_union(ml_ids, tn_ids):
    """UNION ALL de ambas tablas de envíos. Devuelve (sql, params) o ("", {}).

    Columnas de la unión: channel, external_id (ML: shipment id; TN:
    order_id), order_id, order_data (TN: items de la orden), status (por
    fila), data, last_updated, status_group.
    """
    branches = []
    params = {}
    if ml_ids:
        branches.append(
            "SELECT 'ml' AS channel, s.external_id AS external_id,"
            " s.order_id, NULL AS order_data, s.status AS status,"
            " s.data AS data, s.updated_at AS last_updated,"
            " " + _STATUS_GROUP_SQL + " AS status_group"
            " FROM " + ML_SHIPMENTS_TABLE + " s"
            " WHERE s.account_id IN (" + _in_clause("ml", ml_ids) + ")")
        params.update(_in_params("ml", ml_ids))
    if tn_ids:
        branches.append(
            "SELECT 'tn' AS channel, s.order_id AS external_id,"
            " s.order_id, o.data AS order_data, s.status AS status,"
            " s.data AS data, s.updated_at AS last_updated,"
            " " + _STATUS_GROUP_SQL + " AS status_group"
            " FROM " + TN_SHIPMENTS_TABLE + " s"
            " LEFT JOIN " + TN_ORDERS_TABLE + " o"
            "   ON o.account_id = s.account_id AND o.order_id = s.order_id"
            " WHERE s.account_id IN (" + _in_clause("tn", tn_ids) + ")")
        params.update(_in_params("tn", tn_ids))
    return " UNION ALL ".join(branches), params


# Búsqueda `q` (igual para página, total y counts).
_Q_FILTER = (
    " AND (:q = '' OR t.external_id LIKE :like_q"
    " OR t.order_id LIKE :like_q"
    " OR CAST(t.data AS CHAR) LIKE :like_q)"
)


def _ml_receiver(data):
    addr = data.get("receiver_address") or {}
    if not isinstance(addr, dict):
        addr = {}

    def _name(value):
        if isinstance(value, dict):
            return value.get("name") or ""
        return str(value or "")

    return {
        "city": _name(addr.get("city")),
        "state": _name(addr.get("state")),
        "zip_code": str(addr.get("zip_code") or ""),
    }


def _tn_receiver(data):
    addr = data.get("shipping_address") or {}
    if not isinstance(addr, dict):
        addr = {}
    return {
        "city": str(addr.get("city") or ""),
        "state": str(addr.get("province") or ""),
        "zip_code": str(addr.get("zipcode") or ""),
    }


def _ml_items(data):
    items = data.get("items") or data.get("shipping_items") or []
    out = []
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            continue
        out.append({
            "id": str(it.get("id") or ""),
            "title": str(it.get("title") or it.get("description") or ""),
            "quantity": int(it.get("quantity") or 1),
        })
    return out


def _tn_items(raw):
    """Items de la orden TN (tiendanube.orders.data). Tolerante: lista de
    items normalizados (record_order), dict con products/items (filas viejas)
    o JSON string. `id` = sku del producto (fallback índice de la lista)."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            return []
    if isinstance(raw, dict):
        raw = next((raw.get(k) for k in ("products", "items")
                    if isinstance(raw.get(k), list)), [])
    if not isinstance(raw, list):
        return []
    out = []
    for index, it in enumerate(raw):
        if not isinstance(it, dict):
            continue
        item_id = it.get("sku") or it.get("id")
        out.append({
            "id": str(item_id) if item_id else str(index),
            "title": str(it.get("title") or it.get("name")
                         or it.get("product_name") or ""),
            "quantity": int(it.get("quantity") or 0),
        })
    return out


def _tn_tracking_url(data):
    """tracking_info.url del primer Fulfillment Order (aggregate oficial)."""
    for fo in data.get("fulfillments") or []:
        if not isinstance(fo, dict):
            continue
        info = fo.get("tracking_info") or {}
        if isinstance(info, dict) and info.get("url"):
            return info["url"]
    return None


def _shipment_item(row):
    """Dict de un envío (item del listado unificado, contrato del Figma)."""
    channel = row["channel"]
    data = _json_load(row.get("data"))
    order_id = str(row["order_id"]) if row.get("order_id") is not None else None
    external_id = str(row["external_id"])

    if channel == "ml":
        return {
            "id": "ml-" + external_id,
            "channel": "ml",
            "external_id": external_id,
            "order_id": order_id,
            "status": row.get("status"),
            "substatus": data.get("substatus"),
            "logistic_type": data.get("logistic_type"),
            "mode": data.get("shipping_mode") or data.get("mode"),
            "shipping_method": None,
            "tracking_number": data.get("tracking_number"),
            "tracking_url": None,
            "receiver": _ml_receiver(data),
            "items": _ml_items(data),
            "last_updated": _serializable(row.get("last_updated")),
        }

    return {
        "id": "tn-" + str(order_id),
        "channel": "tn",
        "external_id": external_id,
        "order_id": order_id,
        "status": row.get("status"),
        "substatus": None,
        "logistic_type": None,
        "mode": None,
        "shipping_method": str(data.get("shipping_option")
                                or data.get("shipping") or ""),
        "tracking_number": data.get("shipping_tracking_number"),
        "tracking_url": _tn_tracking_url(data),
        "receiver": _tn_receiver(data),
        "items": _tn_items(row.get("order_data")),
        "last_updated": _serializable(row.get("last_updated")),
    }


# ─── endpoint ─────────────────────────────────────────────────────────────────

@shipments_bp.route("/shipments", methods=["GET"])
@require_auth
def list_shipments():
    channel = (request.args.get("channel") or "all").strip()
    status_group = (request.args.get("status_group")
                    or request.args.get("status") or "all").strip()
    q = (request.args.get("q") or "").strip()
    try:
        page = max(0, int(request.args.get("page") or 0))
        page_size = min(200, max(1, int(request.args.get("page_size") or 50)))
    except ValueError:
        return jsonify({"error": "bad_request",
                        "message": "Paginación inválida"}), 400

    business_id = current_business_id()
    zero_counts = {"total": 0, "to_prepare": 0, "in_transit": 0,
                   "delivered": 0, "incidents": 0}

    # Cuentas del negocio (filtradas por canal si viene): fuente de ownership.
    accounts_sql = ("SELECT id, platform FROM " + ACCOUNTS_TABLE
                    + " WHERE business_id = :b")
    accounts_params = {"b": business_id}
    if channel in ("ml", "tn"):
        accounts_sql += " AND platform = :platform"
        accounts_params["platform"] = ("mercadolibre" if channel == "ml"
                                        else "tiendanube")
    accounts = get_all(accounts_sql, accounts_params)
    if not accounts:
        return jsonify({"items": [], "total": 0, "page": page,
                        "page_size": page_size, "counts": zero_counts,
                        "account_total": 0})

    ml_ids = [a["id"] for a in accounts if a["platform"] == "mercadolibre"]
    tn_ids = [a["id"] for a in accounts if a["platform"] == "tiendanube"]
    union, union_params = _shipments_union(ml_ids, tn_ids)
    if not union:
        return jsonify({"items": [], "total": 0, "page": page,
                        "page_size": page_size, "counts": zero_counts,
                        "account_total": 0})

    # `status_group` filtra SOLO la página y el total (paginación); counts no.
    group_filter = ""
    base_params = dict(union_params, q=q, like_q="%" + q + "%")
    if status_group in GROUP_VALUES:
        group_filter = " AND t.status_group = :status_group"
        base_params["status_group"] = status_group

    rows = get_all(
        "SELECT t.* FROM (" + union + ") t WHERE 1=1" + _Q_FILTER + group_filter
        + " ORDER BY t.last_updated DESC, t.order_id DESC"
        + " LIMIT :limit OFFSET :offset",
        dict(base_params, limit=page_size, offset=page * page_size))

    total_row = get_one(
        "SELECT COUNT(*) AS n FROM (" + union + ") t WHERE 1=1"
        + _Q_FILTER + group_filter,
        base_params)
    total = int(total_row["n"] or 0)

    counts_row = get_one(
        "SELECT COUNT(*) AS total,"
        " SUM(CASE WHEN t.status_group = 'to_prepare' THEN 1 ELSE 0 END)"
        "   AS to_prepare,"
        " SUM(CASE WHEN t.status_group = 'in_transit' THEN 1 ELSE 0 END)"
        "   AS in_transit,"
        " SUM(CASE WHEN t.status_group = 'delivered' THEN 1 ELSE 0 END)"
        "   AS delivered,"
        " SUM(CASE WHEN t.status_group IN ('not_delivered','cancelled')"
        "     THEN 1 ELSE 0 END) AS incidents"
        " FROM (" + union + ") t WHERE 1=1" + _Q_FILTER,
        base_params)
    counts = {k: int(counts_row[k] or 0)
              for k in ("total", "to_prepare", "in_transit",
                        "delivered", "incidents")}

    # Envíos de la cuenta SIN ningún filtro (estado vacío de la pantalla).
    account_total = int(get_one(
        "SELECT COUNT(*) AS n FROM (" + union + ") t",
        union_params)["n"] or 0)

    items = [_shipment_item(r) for r in rows]

    logger.info("shipments channel=%s group=%s q=%s page=%s total=%s",
                channel or "-", status_group or "-", q or "-", page, total)
    return jsonify({"items": items, "total": total, "page": page,
                    "page_size": page_size, "counts": counts,
                    "account_total": account_total})
