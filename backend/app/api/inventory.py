"""REST API for inventory visibility: products list/detail/edit/delete and
product images (GCS upload/delete).

Everything is scoped to the authenticated user's business_id.
"""
import csv
import io
import math
from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, Response, jsonify, make_response, request, stream_with_context

from app import cache
from app.api.auth_utils import current_business_id, require_auth
from app.db.helpers import execute, get_all, get_one, insert_and_get_id, run_parallel, stream_rows
from app.settings.config import SCHEMA_INVENTORY
from app.utils.logger import logger

inventory_bp = Blueprint("inventory_api", __name__, url_prefix="/api/inventory")

PRODUCTS_TABLE = SCHEMA_INVENTORY + ".products"
IMAGES_TABLE = SCHEMA_INVENTORY + ".product_images"
VARIATIONS_TABLE = SCHEMA_INVENTORY + ".product_variations"
MOVEMENTS_TABLE = SCHEMA_INVENTORY + ".stock_movements"

MAX_IMAGES_PER_PRODUCT = 10
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

# TTLs de la cache en memoria (ver app/cache.py). Cortos a propósito: el
# dashboard tolera segundos de latencia en lecturas repetidas y cada
# escritura invalida su negocio de todos modos.
TTL_PRODUCTS_LIST = 30
TTL_CATEGORIES = 60


def csv_response(columns, rows, filename):
    """CSV con header en español (etiquetas de `columns`), BOM para Excel y
    Content-Disposition de descarga. `columns` = [{key, label}]."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([c["label"] for c in columns])
    for row in rows:
        writer.writerow([
            "" if row.get(c["key"]) is None else row.get(c["key"])
            for c in columns
        ])
    response = make_response("\uFEFF" + buf.getvalue())
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers["Content-Disposition"] = 'attachment; filename="%s"' % filename
    return response


def stream_csv_response(columns, row_batches, filename):
    """CSV generado incrementalmente: header + las filas a medida que llegan.

    `row_batches` es un generador de listas de dicts (helpers.stream_rows).
    La memoria del proceso no crece con el tamaño del export: solo se
    materializa un batch por vez.
    """
    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        yield "\uFEFF"  # BOM para Excel (una vez, antes del header)
        buf.seek(0)
        buf.truncate(0)
        writer.writerow([c["label"] for c in columns])
        yield buf.getvalue()
        for batch in row_batches:
            buf.seek(0)
            buf.truncate(0)
            for row in batch:
                writer.writerow([
                    "" if row.get(c["key"]) is None else row.get(c["key"])
                    for c in columns
                ])
            yield buf.getvalue()

    response = Response(stream_with_context(generate()))
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers["Content-Disposition"] = 'attachment; filename="%s"' % filename
    return response


# ─── Status mapping (DB values -> the Figma channel statuses) ────────────────

def ml_status_from_db(status, reason):
    s = status or ""
    if s in ("active", "Active", "Updated."):
        return "published"
    if s in ("paused", "Paused."):
        return "paused"
    if s.startswith("Procesando"):
        return "prepublished"
    if s.startswith("under_review"):
        # 'under_review' es el estado real de Meli mientras MODERA el item:
        # estado propio ("En revisión"), distinto de "Pre-publicado" (que es
        # el item recién enviado procesándose para activarse).
        return "under_review"
    if s.startswith("Failed") or s.startswith("Error"):
        return "failed"
    if s in ("closed", "inactive"):
        return "unpublished"
    if reason and str(reason) not in ("", "None"):
        return "failed"
    return "unpublished"


def tn_status_from_db(status, reason):
    s = status or ""
    if s in ("Published", "Updated.", "published", "active"):
        return "published"
    if s in ("paused", "Paused."):
        return "paused"
    if s.startswith("Procesando"):
        return "prepublished"
    if s.startswith("Failed") or s.startswith("Error"):
        return "failed"
    if reason and str(reason) not in ("", "None"):
        return "failed"
    return "unpublished"


def _serializable(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat(sep=" ")
    if isinstance(value, Decimal):
        return float(value)
    return value


def _product_dict(row):
    return {
        "id": row["id"],
        "internal_code": row.get("internal_code"),
        "sku": row.get("sku"),
        "gtin": row.get("gtin"),
        "name": row.get("name"),
        "name_edited": row.get("name_edited"),
        "description": row.get("description"),
        "category": row.get("category"),
        "brand": row.get("brand"),
        "model": row.get("model"),
        "price": _serializable(row.get("price") or 0),
        "cost": _serializable(row.get("cost") or 0),
        "stock": int(row.get("stock") or 0),
        "dimensions": row.get("dimensions"),
        "drive_url": row.get("drive_url"),
        "created_at": _serializable(row.get("created_at")),
        "updated_at": _serializable(row.get("updated_at")),
    }


image_subquery = (
    "(SELECT i.url FROM " + IMAGES_TABLE + " i"
    " WHERE i.product_id = {alias}.id ORDER BY i.id LIMIT 1) AS image_url"
)


def _list_product_dict(product_id):
    """Fila completa del producto como la arma el listado (ml/tn status,
    precios de canal e imagen). La usa el PATCH: el front reemplaza la fila
    editada con esta respuesta y no puede perder campos (antes faltaban
    ml_status/tn_status y la tabla rompía con 'reading color')."""
    row = get_one(
        "SELECT p.id, p.internal_code, p.sku, p.gtin, p.name, p.name_edited,"
        " p.brand, p.model, p.category, p.stock, p.cost, p.price, p.dimensions,"
        " p.created_at, p.updated_at,"
        " ml.price AS ml_price, tn.price AS tn_price,"
        " " + _ML_STATUS_SQL + " AS ml_status,"
        " " + _TN_STATUS_SQL + " AS tn_status,"
        + image_subquery.format(alias="p")
        + " FROM " + PRODUCTS_TABLE + " p"
        " LEFT JOIN mercadolibre.product_listings ml ON ml.product_id = p.id"
        " LEFT JOIN tiendanube.product_listings tn ON tn.product_id = p.id"
        " WHERE p.id = :id AND p.business_id = :b",
        {"id": product_id, "b": current_business_id()})
    return {
        "id": row["id"],
        "internal_code": row.get("internal_code"),
        "sku": row.get("sku"),
        "gtin": row.get("gtin"),
        "name": row.get("name"),
        "name_edited": row.get("name_edited"),
        "brand": row.get("brand"),
        "model": row.get("model"),
        "category": row.get("category"),
        "stock": int(row.get("stock") or 0),
        "cost": _serializable(row.get("cost") or 0),
        "price": _serializable(row.get("price") or 0),
        "dimensions": row.get("dimensions"),
        "created_at": _serializable(row.get("created_at")),
        "updated_at": _serializable(row.get("updated_at")),
        "ml_price": _serializable(row.get("ml_price")),
        "tn_price": _serializable(row.get("tn_price")),
        "ml_status": row["ml_status"],
        "tn_status": row["tn_status"],
        "image_url": row.get("image_url"),
    }


def _owned_product(product_id):
    """Return the product row or abort with 404 when not owned."""
    try:
        return get_one(
            "SELECT * FROM " + PRODUCTS_TABLE
            + " WHERE id = :id AND business_id = :business_id",
            {"id": product_id, "business_id": current_business_id()})
    except LookupError:
        return None


# ─── Products ─────────────────────────────────────────────────────────────────

_ML_STATUS_SQL = (
    "CASE WHEN ml.id IS NULL THEN 'unpublished'"
    " WHEN ml.status IN ('active','Active','Updated.') THEN 'published'"
    " WHEN ml.status IN ('paused','Paused.') THEN 'paused'"
    " WHEN ml.status LIKE 'Procesando%' THEN 'prepublished'"
    " WHEN ml.status LIKE 'under_review%' THEN 'under_review'"
    " WHEN ml.status LIKE 'Failed%' OR ml.status LIKE 'Error%' THEN 'failed'"
    " WHEN ml.status IN ('closed','inactive') THEN 'unpublished'"
    " WHEN ml.reason IS NOT NULL AND ml.reason NOT IN ('','None') THEN 'failed'"
    " ELSE 'unpublished' END"
)

_TN_STATUS_SQL = (
    "CASE WHEN tn.id IS NULL THEN 'unpublished'"
    " WHEN tn.status IN ('Published','Updated.','published','active') THEN 'published'"
    " WHEN tn.status IN ('paused','Paused.') THEN 'paused'"
    " WHEN tn.status LIKE 'Procesando%' THEN 'prepublished'"
    " WHEN tn.status LIKE 'Failed%' OR tn.status LIKE 'Error%' THEN 'failed'"
    " WHEN tn.reason IS NOT NULL AND tn.reason NOT IN ('','None') THEN 'failed'"
    " ELSE 'unpublished' END"
)


def _list_products_payload(business_id, q, category, ml_status, tn_status,
                           channel, stock, page, page_size):
    """Payload JSON del listado de productos (cacheable, sin request context)."""
    like_q = "%" + q + "%"
    filters = (
        " WHERE p.business_id = :business_id"
        " AND (:q = '' OR p.name LIKE :like_q OR p.internal_code LIKE :like_q OR p.sku LIKE :like_q)"
        " AND (:category = '' OR p.category = :category)"
        " AND (:stock = '' OR (:stock = 'in' AND p.stock > 0) OR (:stock = 'out' AND p.stock <= 0))"
    )
    outer = (
        " WHERE 1=1"
        " AND (:ml_status = '' OR t.ml_status = :ml_status)"
        " AND (:tn_status = '' OR t.tn_status = :tn_status)"
        " AND (:channel = ''"
        "   OR (:channel = 'ml' AND t.ml_status <> 'unpublished')"
        "   OR (:channel = 'tn' AND t.tn_status <> 'unpublished'))"
    )

    inner = None  # built on demand inside the computed-filters branch below

    base_params = {
        "business_id": business_id,
        "q": q,
        "like_q": like_q,
        "category": category,
        "ml_status": ml_status,
        "tn_status": tn_status,
        "channel": channel,
        "stock": stock,
    }

    # Columnas base (sin total ni imagen: cada rama las agrega a su manera).
    base_cols = (
        "SELECT p.id, p.internal_code, p.sku, p.gtin, p.name, p.name_edited, p.brand,"
        " p.model, p.category, p.stock, p.cost, p.price, p.dimensions,"
        " p.created_at, p.updated_at,"
        " ml.price AS ml_price, ml.price_manually_changed AS ml_price_manual,"
        " ml.price_updated_at AS ml_price_updated,"
        " tn.price AS tn_price, tn.price_manually_changed AS tn_price_manual,"
        " tn.price_updated_at AS tn_price_updated,"
        " " + _ML_STATUS_SQL + " AS ml_status,"
        " " + _TN_STATUS_SQL + " AS tn_status"
        " FROM " + PRODUCTS_TABLE + " p"
        " LEFT JOIN mercadolibre.product_listings ml ON ml.product_id = p.id"
        " LEFT JOIN tiendanube.product_listings tn ON tn.product_id = p.id"
    )

    # Una sola query por request: el total viaja con COUNT(*) OVER() (MySQL 8
    # calcula la ventana antes del LIMIT) y la primer imagen va como subquery.
    # Evita 3 conexiones/round-trips a Cloud SQL por página.
    computed_filters = bool(ml_status or tn_status or channel)
    limit_params = dict(base_params, limit=page_size, offset=(page - 1) * page_size)

    if computed_filters:
        inner = base_cols + filters
        rows = get_all(
            "SELECT t.*, COUNT(*) OVER() AS total,"
            + image_subquery.format(alias="t")
            + " FROM (" + inner + ") t" + outer
            + " ORDER BY t.updated_at DESC, t.id DESC LIMIT :limit OFFSET :offset",
            limit_params)
    else:
        rows = get_all(
            "SELECT p.id, p.internal_code, p.sku, p.gtin, p.name, p.name_edited, p.brand,"
            " p.model, p.category, p.stock, p.cost, p.price, p.dimensions,"
            " p.created_at, p.updated_at,"
            " COUNT(*) OVER() AS total,"
            " ml.price AS ml_price, ml.price_manually_changed AS ml_price_manual,"
            " ml.price_updated_at AS ml_price_updated,"
            " tn.price AS tn_price, tn.price_manually_changed AS tn_price_manual,"
            " tn.price_updated_at AS tn_price_updated,"
            " " + _ML_STATUS_SQL + " AS ml_status,"
            " " + _TN_STATUS_SQL + " AS tn_status,"
            + image_subquery.format(alias="p")
            + " FROM " + PRODUCTS_TABLE + " p"
            " LEFT JOIN mercadolibre.product_listings ml ON ml.product_id = p.id"
            " LEFT JOIN tiendanube.product_listings tn ON tn.product_id = p.id"
            + filters
            + " ORDER BY p.id DESC LIMIT :limit OFFSET :offset",
            limit_params)

    total = int(rows[0]["total"] or 0) if rows else 0
    if not rows:
        # Página fuera de rango (o filtro sin resultados): el total no vino en
        # las filas. Recalculamos aplicando los MISMOS filtros.
        if computed_filters:
            inner = base_cols + filters
            total = int(get_one(
                "SELECT COUNT(*) AS total FROM (" + inner + ") t" + outer,
                base_params)["total"] or 0)
        else:
            total = int(get_one(
                "SELECT COUNT(*) AS total FROM " + PRODUCTS_TABLE + " p" + filters,
                base_params)["total"] or 0)

    items = []
    for row in rows:
        items.append({
            "id": row["id"],
            "internal_code": row.get("internal_code"),
            "sku": row.get("sku"),
            "gtin": row.get("gtin"),
            "name": row.get("name"),
            "name_edited": row.get("name_edited"),
            "brand": row.get("brand"),
            "model": row.get("model"),
            "category": row.get("category"),
            "stock": int(row.get("stock") or 0),
            "cost": _serializable(row.get("cost") or 0),
            "price": _serializable(row.get("price") or 0),
            "dimensions": row.get("dimensions"),
            "created_at": _serializable(row.get("created_at")),
            "updated_at": _serializable(row.get("updated_at")),
            "ml_price": _serializable(row.get("ml_price")),
            "tn_price": _serializable(row.get("tn_price")),
            "ml_price_manual": bool(row.get("ml_price_manual")),
            "ml_price_updated": _serializable(row.get("ml_price_updated")),
            "tn_price_manual": bool(row.get("tn_price_manual")),
            "tn_price_updated": _serializable(row.get("tn_price_updated")),
            "ml_status": row["ml_status"],
            "tn_status": row["tn_status"],
            "image_url": row.get("image_url"),
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
    }


@inventory_bp.route("/products", methods=["GET"])
@require_auth
def list_products():
    q = (request.args.get("q") or "").strip()
    category = (request.args.get("category") or "").strip()
    ml_status = (request.args.get("ml_status") or "").strip()
    tn_status = (request.args.get("tn_status") or "").strip()
    channel = (request.args.get("channel") or "").strip()
    stock = (request.args.get("stock") or "").strip()
    try:
        page = max(1, int(request.args.get("page") or 1))
        page_size = min(200, max(1, int(request.args.get("page_size") or 50)))
    except ValueError:
        return jsonify({"error": "bad_request", "message": "Paginación inválida"}), 400

    # Cache en memoria por (negocio, filtros, página): la clave lleva la
    # versión del business, así cualquier escritura de productos/listados
    # la invalida automáticamente (ver app/cache.py).
    business_id = current_business_id()
    payload = cache.get_or_compute(
        business_id, "products_list", TTL_PRODUCTS_LIST,
        lambda: _list_products_payload(
            business_id, q, category, ml_status, tn_status, channel, stock,
            page, page_size),
        q, category, ml_status, tn_status, channel, stock, page, page_size)
    return jsonify(payload)


_EXPORT_COLUMNS = [
    {"key": "id", "label": "ID"},
    {"key": "internal_code", "label": "Código interno"},
    {"key": "sku", "label": "SKU"},
    {"key": "gtin", "label": "GTIN"},
    {"key": "name", "label": "Producto"},
    {"key": "name_edited", "label": "Nombre editado"},
    {"key": "brand", "label": "Marca"},
    {"key": "model", "label": "Modelo"},
    {"key": "category", "label": "Categoría"},
    {"key": "stock", "label": "Stock"},
    {"key": "cost", "label": "Costo"},
    {"key": "price", "label": "Precio"},
    {"key": "dimensions", "label": "Dimensiones"},
    {"key": "created_at", "label": "Creado"},
    {"key": "updated_at", "label": "Actualizado"},
    {"key": "ml_price", "label": "Precio ML"},
    {"key": "ml_price_manual", "label": "Precio manual ML"},
    {"key": "ml_price_updated", "label": "Precio actualizado ML"},
    {"key": "tn_price", "label": "Precio TN"},
    {"key": "tn_price_manual", "label": "Precio manual TN"},
    {"key": "tn_price_updated", "label": "Precio actualizado TN"},
    {"key": "ml_status", "label": "Estado ML"},
    {"key": "tn_status", "label": "Estado TN"},
]

_STATUS_LABELS = {
    "published": "Publicado",
    "paused": "Pausado",
    "prepublished": "Pre-publicado",
    "under_review": "En revisión",
    "unpublished": "Sin publicar",
    "failed": "Sin publicar",
}


@inventory_bp.route("/products/export.csv", methods=["GET"])
@require_auth
def export_products_csv():
    """CSV del inventario: mismas búsqueda/filtros que la lista, con columnas
    elegidas (`columns` separadas por coma) y `limit` (0 = todas)."""
    q = (request.args.get("q") or "").strip()
    category = (request.args.get("category") or "").strip()
    ml_status = (request.args.get("ml_status") or "").strip()
    tn_status = (request.args.get("tn_status") or "").strip()
    channel = (request.args.get("channel") or "").strip()
    stock = (request.args.get("stock") or "").strip()
    try:
        limit = int(request.args.get("limit") or 1000)
    except ValueError:
        limit = 1000
    if limit < 0:
        limit = 0

    requested = (request.args.get("columns") or "").split(",")
    columns = [c for c in _EXPORT_COLUMNS if c["key"] in requested]
    if not columns:
        return jsonify({"error": "bad_request",
                        "message": "Elegí al menos una columna para exportar"}), 400

    base_params = {
        "business_id": current_business_id(),
        "q": q,
        "like_q": "%" + q + "%",
        "category": category,
        "stock": stock,
        "ml_status": ml_status,
        "tn_status": tn_status,
        "channel": channel,
    }
    inner = (
        "SELECT p.id, p.internal_code, p.sku, p.gtin, p.name, p.name_edited,"
        " p.brand, p.model, p.category, p.stock, p.cost, p.price, p.dimensions,"
        " p.created_at, p.updated_at,"
        " ml.price AS ml_price, ml.price_manually_changed AS ml_price_manual,"
        " ml.price_updated_at AS ml_price_updated,"
        " tn.price AS tn_price, tn.price_manually_changed AS tn_price_manual,"
        " tn.price_updated_at AS tn_price_updated,"
        " " + _ML_STATUS_SQL + " AS ml_status,"
        " " + _TN_STATUS_SQL + " AS tn_status"
        " FROM " + PRODUCTS_TABLE + " p"
        " LEFT JOIN mercadolibre.product_listings ml ON ml.product_id = p.id"
        " LEFT JOIN tiendanube.product_listings tn ON tn.product_id = p.id"
        " WHERE p.business_id = :business_id"
        " AND (:q = '' OR p.name LIKE :like_q OR p.internal_code LIKE :like_q"
        "      OR p.sku LIKE :like_q)"
        " AND (:category = '' OR p.category = :category)"
        " AND (:stock = '' OR (:stock = 'in' AND p.stock > 0)"
        "      OR (:stock = 'out' AND p.stock <= 0))"
    )
    outer = (
        " WHERE 1=1"
        " AND (:ml_status = '' OR t.ml_status = :ml_status)"
        " AND (:tn_status = '' OR t.tn_status = :tn_status)"
        " AND (:channel = ''"
        "   OR (:channel = 'ml' AND t.ml_status <> 'unpublished')"
        "   OR (:channel = 'tn' AND t.tn_status <> 'unpublished'))"
    )
    sql = ("SELECT t.* FROM (" + inner + ") t" + outer
           + " ORDER BY t.updated_at DESC, t.id DESC")
    params = dict(base_params)
    if limit > 0:
        sql += " LIMIT :limit"
        params["limit"] = limit

    # UNA sola query con cursor server-side: las filas se leen en batches de
    # 1000 y se escriben al CSV a medida que llegan, así la memoria del
    # proceso no crece con el tamaño del export. El `limit` sigue vivo como
    # LIMIT dentro de la misma query.
    def _batches():
        for batch in stream_rows(sql, params):
            # Valores legibles para el CSV.
            for r in batch:
                r["ml_status"] = _STATUS_LABELS.get(r.get("ml_status"), r.get("ml_status"))
                r["tn_status"] = _STATUS_LABELS.get(r.get("tn_status"), r.get("tn_status"))
                r["ml_price_manual"] = "Manual" if r.get("ml_price_manual") else "Auto"
                r["tn_price_manual"] = "Manual" if r.get("tn_price_manual") else "Auto"
            yield batch

    stamp = datetime.now().strftime("%Y%m%d")
    return stream_csv_response(columns, _batches(), "inventario-%s.csv" % stamp)


@inventory_bp.route("/categories", methods=["GET"])
@require_auth
def list_categories():
    """Categorías distintas del negocio (para el filtro del inventario)."""
    business_id = current_business_id()
    items = cache.get_or_compute(
        business_id, "categories", TTL_CATEGORIES,
        lambda: [
            r["category"]
            for r in get_all(
                "SELECT DISTINCT category FROM " + PRODUCTS_TABLE
                + " WHERE business_id = :business_id"
                + " AND category IS NOT NULL AND category <> ''"
                + " ORDER BY category",
                {"business_id": business_id})
        ])
    return jsonify({"items": items})


@inventory_bp.route("/products/<int:product_id>", methods=["GET"])
@require_auth
def get_product(product_id):
    product = _owned_product(product_id)
    if product is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404

    # Las sub-consultas corren en paralelo (una conexión del pool cada una):
    # la latencia pasa de la SUMA de round-trips al MÁXIMO.
    results = run_parallel({
        "images": (
            "SELECT id, url FROM " + IMAGES_TABLE + " WHERE product_id = :id ORDER BY id",
            {"id": product_id}),
        "variations": (
            "SELECT id, sku, gtin, price, cost, stock FROM " + VARIATIONS_TABLE
            + " WHERE product_id = :id ORDER BY id",
            {"id": product_id}),
        "movements": (
            "SELECT id, account_id, order_id, direction, quantity, unit_price,"
            " target_system, provider_doc_id, status, error_message, created_at"
            " FROM " + MOVEMENTS_TABLE
            + " WHERE product_id = :id ORDER BY created_at DESC, id DESC LIMIT 50",
            {"id": product_id}),
        "ml": (
            "SELECT l.id, l.account_id, l.meli_id AS external_id, l.price,"
            " l.status, l.reason, l.remedy, l.permalink, l.created_at, l.updated_at,"
            " l.catalog_product_id, l.marketplace_item_id, l.marketplace_status,"
            " a.name AS account_name"
            " FROM mercadolibre.product_listings l"
            " JOIN platform_accounts.accounts a ON a.id = l.account_id"
            " WHERE l.product_id = :id",
            {"id": product_id}),
        "tn": (
            "SELECT l.id, l.account_id, l.tnube_id AS external_id, l.price,"
            " l.status, l.reason, l.remedy, l.permalink, l.created_at, l.updated_at,"
            " a.name AS account_name"
            " FROM tiendanube.product_listings l"
            " JOIN platform_accounts.accounts a ON a.id = l.account_id"
            " WHERE l.product_id = :id",
            {"id": product_id}),
    })

    images = results["images"]
    variations = results["variations"]
    movements = results["movements"]

    listings = []
    ml = results["ml"][0] if results["ml"] else None
    if ml:
        listings.append({
            "id": ml["id"],
            "platform": "mercadolibre",
            "account_id": ml["account_id"],
            "account_name": ml.get("account_name"),
            "external_id": ml.get("external_id"),
            "price": _serializable(ml.get("price")),
            "status": ml_status_from_db(ml.get("status"), ml.get("reason")),
            "db_status": ml.get("status"),
            "reason": ml.get("reason"),
            "remedy": ml.get("remedy"),
            "permalink": ml.get("permalink"),
            "catalog_listing": bool(ml.get("catalog_product_id")),
            "catalog_product_id": ml.get("catalog_product_id"),
            "marketplace_item_id": ml.get("marketplace_item_id"),
            "marketplace_status": ml.get("marketplace_status"),
            "created_at": _serializable(ml.get("created_at")),
            "updated_at": _serializable(ml.get("updated_at")),
        })

    tn = results["tn"][0] if results["tn"] else None
    if tn:
        listings.append({
            "id": tn["id"],
            "platform": "tiendanube",
            "account_id": tn["account_id"],
            "account_name": tn.get("account_name"),
            "external_id": tn.get("external_id"),
            "price": _serializable(tn.get("price")),
            "status": tn_status_from_db(tn.get("status"), tn.get("reason")),
            "db_status": tn.get("status"),
            "reason": tn.get("reason"),
            "remedy": tn.get("remedy"),
            "permalink": tn.get("permalink"),
            "created_at": _serializable(tn.get("created_at")),
            "updated_at": _serializable(tn.get("updated_at")),
        })

    return jsonify({
        "product": _product_dict(product),
        "images": [{"id": r["id"], "url": r["url"]} for r in images],
        "variations": [{
            "id": r["id"], "sku": r.get("sku"), "gtin": r.get("gtin"),
            "price": _serializable(r.get("price")),
            "cost": _serializable(r.get("cost")),
            "stock": int(r.get("stock") or 0),
        } for r in variations],
        "listings": listings,
        "movements": [{
            "id": r["id"], "account_id": r.get("account_id"),
            "order_id": r.get("order_id"), "direction": r.get("direction"),
            "quantity": int(r.get("quantity") or 0),
            "unit_price": _serializable(r.get("unit_price")),
            "target_system": r.get("target_system"),
            "provider_doc_id": r.get("provider_doc_id"),
            "status": r.get("status"), "error_message": r.get("error_message"),
            "created_at": _serializable(r.get("created_at")),
        } for r in movements],
    })


_PREPUBLISH_DEFAULT_SYS = {
    "title": ("Sos un redactor experto en ecommerce. Mejorá el título del producto."
              " OBLIGATORIO: devolvé SOLO el título, máx. 60 caracteres, sin comillas ni comentarios."),
    "description": ("Sos un redactor experto en ecommerce. Escribí la descripción del producto."
                    " OBLIGATORIO: devolvé SOLO la descripción, sin comillas ni comentarios."),
    "brand": ("Indicá únicamente la marca del producto. Si no podés determinarla, respondé 'Genérico'."
              " OBLIGATORIO: devolvé SOLO la marca."),
    "model": ("Indicá únicamente el modelo del producto. Si no existe, generá un código corto."
              " OBLIGATORIO: devolvé SOLO el modelo."),
}


def _prepublish_sys_prompts(business_id):
    """System prompts del negocio (ai.prompts por business_id) con fallback a
    los defaults: cada negocio tiene sus propios criterios de redacción."""
    prompts = dict(_PREPUBLISH_DEFAULT_SYS)
    try:
        row = get_one(
            "SELECT ai_generate_title, ai_generate_description,"
            " ai_generate_brand, ai_generate_model"
            " FROM ai.prompts WHERE business_id = :b",
            {"b": business_id})
    except LookupError:
        return prompts
    if row.get("ai_generate_title"):
        prompts["title"] = row["ai_generate_title"]
    if row.get("ai_generate_description"):
        prompts["description"] = row["ai_generate_description"]
    if row.get("ai_generate_brand"):
        prompts["brand"] = row["ai_generate_brand"]
    if row.get("ai_generate_model"):
        prompts["model"] = row["ai_generate_model"]
    return prompts


@inventory_bp.route("/products/<int:product_id>/prepublish", methods=["POST"])
@require_auth
def prepublish_product(product_id):
    """Completa con IA los campos faltantes (título, descripción, marca, modelo)
    y deja el producto listo para publicar. Con fallback determinista si la IA
    no responde (misma lógica que el diseño: Genérico / codigo-STD)."""
    product = _owned_product(product_id)
    if product is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404

    name = product.get("name") or ""
    category = (product.get("category") or "producto").lower()
    updates = {}

    fields_to_fill = []
    if not (product.get("name_edited") or "").strip():
        fields_to_fill.append("title")
    if not (product.get("description") or "").strip():
        fields_to_fill.append("description")
    if not (product.get("brand") or "").strip():
        fields_to_fill.append("brand")
    if not (product.get("model") or "").strip():
        fields_to_fill.append("model")

    if not fields_to_fill:
        return jsonify({"product": _product_dict(product), "filled": []})

    # Fallbacks deterministas (igual que el diseño).
    fallbacks = {
        "title": (product.get("name_edited") or name)[:60],
        "description": "%s. Producto de %s de calidad premium, ideal para uso diario. Envio rapido y garantia incluida." % (name, category),
        "brand": "Generico",
        "model": (str(product.get("internal_code") or product_id)) + "-STD",
    }

    # System prompts: los del negocio (ai.prompts por business_id) con fallback
    # a los defaults si no cargó ninguno.
    ai_sys = _prepublish_sys_prompts(current_business_id())

    try:
        from app.service.llm_api import call_deepseek_api
        for field in fields_to_fill:
            try:
                text = call_deepseek_api(ai_sys[field], {"producto": name})
                if text and str(text).strip():
                    updates[field] = str(text).strip()[:2000]
                    continue
            except Exception:
                logger.exception("AI falló para %s (producto %s)", field, product_id)
            updates[field] = fallbacks[field]
    except Exception:
        logger.exception("DeepSeek no disponible, usando fallbacks")
        for field in fields_to_fill:
            updates[field] = fallbacks[field]

    column_map = {"title": "name_edited", "description": "description",
                  "brand": "brand", "model": "model"}
    db_updates = {column_map[k]: v for k, v in updates.items()}
    fields_sql = ", ".join(k + " = :" + k for k in db_updates)
    execute("UPDATE " + PRODUCTS_TABLE + " SET " + fields_sql
            + " WHERE id = :id AND business_id = :business_id",
            dict(db_updates, id=product_id, business_id=current_business_id()))
    cache.invalidate_business(current_business_id())  # post-escritura (ver cache.py)

    return jsonify({"product": _product_dict(_owned_product(product_id)),
                    "filled": [column_map[k] for k in updates]})


@inventory_bp.route("/products/<int:product_id>", methods=["PATCH"])
@require_auth
def patch_product(product_id):
    product = _owned_product(product_id)
    if product is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404

    data = request.get_json(silent=True) or {}
    updates = {}
    if "title" in data:
        updates["name_edited"] = (data.get("title") or "").strip() or None
    if "description" in data:
        updates["description"] = data.get("description")
    if "dimensions" in data:
        updates["dimensions"] = _normalize_dimensions(data.get("dimensions"))
    if "brand" in data:
        updates["brand"] = (data.get("brand") or "").strip() or None
    if "model" in data:
        updates["model"] = (data.get("model") or "").strip() or None
    if "price" in data:
        try:
            price = int(float(data.get("price")))
        except (TypeError, ValueError):
            return jsonify({"error": "bad_request",
                            "message": "El precio debe ser numérico"}), 400
        if price < 0:
            return jsonify({"error": "bad_request",
                            "message": "El precio no puede ser negativo"}), 400
        updates["price"] = price
    if "dimensions_cm_g" in data:
        dims = data.get("dimensions_cm_g") or {}
        if isinstance(dims, dict):
            try:
                h = float(dims.get("height") or 0)
                w = float(dims.get("width") or 0)
                d = float(dims.get("depth") or 0)
                weight = float(dims.get("weight") or 0)
                updates["dimensions"] = "{}x{}x{},{}".format(h, w, d, weight)
            except (TypeError, ValueError):
                return jsonify({"error": "bad_request",
                                "message": "Dimensiones inválidas"}), 400

    if not updates:
        return jsonify({"error": "bad_request", "message": "Nada para actualizar"}), 400

    fields = ", ".join(k + " = :" + k for k in updates)
    params = dict(updates, id=product_id, business_id=current_business_id())
    execute("UPDATE " + PRODUCTS_TABLE + " SET " + fields
            + " WHERE id = :id AND business_id = :business_id", params)
    cache.invalidate_business(current_business_id())  # post-escritura (ver cache.py)

    return jsonify({"product": _list_product_dict(product_id)})


def _normalize_dimensions(value):
    if value is None:
        return None
    return str(value).strip() or None


@inventory_bp.route("/products/<int:product_id>", methods=["DELETE"])
@require_auth
def delete_product(product_id):
    product = _owned_product(product_id)
    if product is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404

    rowcount = execute(
        "DELETE FROM " + PRODUCTS_TABLE
        + " WHERE id = :id AND business_id = :business_id",
        {"id": product_id, "business_id": current_business_id()})
    if not rowcount:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
    cache.invalidate_business(current_business_id())  # post-escritura (ver cache.py)
    logger.info("Product %s deleted by business %s", product_id, current_business_id())
    return ("", 204)


# ─── Product images (GCS) ─────────────────────────────────────────────────────

def _gcs_bucket():
    from google.cloud import storage  # deferred: heavy import, optional locally
    client = storage.Client()
    return client.bucket("pictures_ecommerce_guiaslocales")


@inventory_bp.route("/products/<int:product_id>/images", methods=["POST"])
@require_auth
def upload_image(product_id):
    product = _owned_product(product_id)
    if product is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404

    file = request.files.get("file")
    if file is None:
        return jsonify({"error": "missing_file", "message": "Falta el archivo"}), 400

    raw = file.read()
    if len(raw) > MAX_IMAGE_BYTES:
        return jsonify({"error": "too_large",
                        "message": "Imagen demasiado grande (máx 10 MB)"}), 400
    if raw[:8] != PNG_MAGIC:
        return jsonify({"error": "invalid_format",
                        "message": "Solo se aceptan imágenes PNG"}), 400

    count_row = get_one(
        "SELECT COUNT(*) AS total FROM " + IMAGES_TABLE + " WHERE product_id = :id",
        {"id": product_id})
    if int(count_row["total"]) >= MAX_IMAGES_PER_PRODUCT:
        return jsonify({"error": "limit_reached",
                        "message": "Máximo %d imágenes por producto" % MAX_IMAGES_PER_PRODUCT}), 400

    existing = get_all(
        "SELECT url FROM " + IMAGES_TABLE + " WHERE product_id = :id",
        {"id": product_id})
    used = set()
    for r in existing:
        filename = (r["url"] or "").rsplit("/", 1)[-1]
        if "_" in filename:
            used.add(filename)
    number = 1
    while "{}_{}.png".format(product_id, number) in used:
        number += 1

    blob_path = "{}/{}_{}.png".format(product_id, product_id, number)
    try:
        blob = _gcs_bucket().blob(blob_path)
        blob.upload_from_string(raw, content_type="image/png")
    except Exception as exc:
        logger.exception("GCS upload failed for product %s", product_id)
        message = str(exc)
        if "storage.objects.create" in message or "403" in message:
            message = (
                "La service account de GCP no tiene permisos de escritura sobre "
                "el bucket pictures_ecommerce_guiaslocales (falta storage.objects.create). "
                "Otorgale el rol 'Storage Object Admin' a la service account desde "
                "la consola de GCP y volvé a intentar."
            )
        return jsonify({"error": "storage_unavailable",
                        "message": "No se pudo subir la imagen: %s" % message}), 502

    image_id = insert_and_get_id(
        "INSERT INTO " + IMAGES_TABLE + " (product_id, url) VALUES (:product_id, :url)",
        {"product_id": product_id, "url": blob.public_url})
    cache.invalidate_business(current_business_id())  # post-escritura (ver cache.py)
    return jsonify({"id": image_id, "url": blob.public_url}), 201


@inventory_bp.route("/products/<int:product_id>/images/<int:image_id>", methods=["DELETE"])
@require_auth
def delete_image(product_id, image_id):
    try:
        row = get_one(
            "SELECT i.id, i.url FROM " + IMAGES_TABLE + " i"
            " JOIN " + PRODUCTS_TABLE + " p ON p.id = i.product_id"
            " WHERE i.id = :image_id AND i.product_id = :product_id"
            " AND p.business_id = :business_id",
            {"image_id": image_id, "product_id": product_id,
             "business_id": current_business_id()})
    except LookupError:
        return jsonify({"error": "not_found", "message": "Imagen no encontrada"}), 404

    # Best-effort: the DB row is the source of truth, the blob may already be gone.
    try:
        blob_path = _blob_path_from_url(row["url"], product_id)
        blob = _gcs_bucket().blob(blob_path)
        if blob.exists():
            blob.delete()
    except Exception:
        logger.exception("GCS delete failed for image %s", image_id)

    execute("DELETE FROM " + IMAGES_TABLE + " WHERE id = :id", {"id": image_id})
    cache.invalidate_business(current_business_id())  # post-escritura (ver cache.py)
    return ("", 204)


def _blob_path_from_url(url, product_id):
    prefix = "https://storage.googleapis.com/pictures_ecommerce_guiaslocales/"
    if url.startswith(prefix):
        return url[len(prefix):]
    parts = url.split("/")
    return "/".join(parts[-2:])
