"""REST API for channel operations used by the publish UI:

- GET  /api/accounts                          -> connected accounts per business
- GET  /api/mercadolibre/categories?q=        -> ML domain discovery results
- GET  /api/mercadolibre/listing-prices?price=&category_id= -> fee/campaign info
- POST /api/mercadolibre/configure            -> set category, build settings
- POST /api/mercadolibre/publish|update|pause|delete
- POST /api/tiendanube/publish|update|delete
- GET  /api/mercadolibre/listings             -> publicaciones ML (vista Inventario > ML)
- GET  /api/tiendanube/listings               -> publicaciones TN (vista Inventario > TN)
- GET  /api/mercadolibre/shipments            -> envíos ML (mercadolibre.shipments)
- POST /api/mercadolibre/pictures             -> descarga fotos de la publicación a GCS

These wrap the existing pipelines (app.pipelines.publish) so all actions are
executed exactly like the webhook-driven flows, with the authenticated user
recorded as the actor in platform_accounts.events.
"""
import hashlib
import base64
import json
import time
import uuid
from datetime import datetime

import requests
from flask import Blueprint, jsonify, make_response, request
from sqlalchemy import text

from app import cache
from app.api.auth_utils import current_business_id, current_user, require_auth
from app.api.inventory import (
    _STATUS_LABELS,
    _serializable,
    csv_response,
    ml_status_from_db,
    stream_csv_response,
    tn_status_from_db,
)
from app.db.claims import claim, finish, fail
from app.db.engine import engine
from app.db.helpers import execute, get_all, get_one, insert_and_get_id, stream_rows
from app.integrations.core.credentials import get_access_token
from app.integrations.core.bools import is_truthy
from app.integrations.mercadolibre.product_handler import _meli_request, _settings_builder
from app.integrations.mercadolibre.size_grid import grid_required
from app.integrations.tiendanube.product_handler import (
    TN_AGE_GROUP_OPTIONS,
    TN_GENDER_OPTIONS,
    create_categories,
    normalize_tn_age_group,
    normalize_tn_gender,
)
from app.pipelines.publish import pipeline_publish
from app.settings.config import SCHEMA_ACCOUNTS
from app.utils.logger import logger, set_event_id

channels_bp = Blueprint("channels_api", __name__, url_prefix="/api")

ACCOUNTS_TABLE = SCHEMA_ACCOUNTS + ".accounts"
MELI_BASE_URL = "https://api.mercadolibre.com"

ML_LISTINGS_TABLE = "mercadolibre.product_listings"
ML_ATTRIBUTES_TABLE = "mercadolibre.attributes"
TN_LISTINGS_TABLE = "tiendanube.product_listings"
TN_ATTRIBUTES_TABLE = "tiendanube.attributes"

# Resumen de publicaciones ML: TTL corto — la vista se refresca seguido y
# publish/pause/delete/price (y los webhooks de items) lo invalidan.
TTL_ML_SUMMARY = 15
# Filas de las vistas ML/TN (paginadas): mismo TTL que el resumen ML para que
# refresquen juntos. TN no tiene escritores externos (solo el dashboard), así
# que aguanta un poco más.
TTL_ML_ROWS = 15
TTL_TN_ROWS = 30

TN_DEFAULT_SETTINGS = {
    "SEO_TITLE": {"DEFAULT_VALUE": None, "USER_INPUT_VALUE": None},
    "SEO_DESCRIPTION": {"DEFAULT_VALUE": None, "USER_INPUT_VALUE": None},
    "BARCODE": {"DEFAULT_VALUE": None, "USER_INPUT_VALUE": None},
    "VIDEO_URL": {"DEFAULT_VALUE": None, "USER_INPUT_VALUE": None},
    "TAGS": {"DEFAULT_VALUE": [None], "USER_INPUT_VALUE": None},
    "PROMOTIONAL_PRICE": {"DEFAULT_VALUE": None, "USER_INPUT_VALUE": None},
    "MPN": {"DEFAULT_VALUE": None, "USER_INPUT_VALUE": None},
    "AGE_GROUP": {"DEFAULT_VALUE": None, "USER_INPUT_VALUE": None},
    "GENDER": {"DEFAULT_VALUE": None, "USER_INPUT_VALUE": None},
    "FREE_SHIPPING": {"DEFAULT_VALUE": None, "USER_INPUT_VALUE": None},
}


# ─── helpers ──────────────────────────────────────────────────────────────────

def _owned_product(product_id):
    try:
        return get_one(
            "SELECT * FROM inventory.products WHERE id = :id AND business_id = :b",
            {"id": product_id, "b": current_business_id()})
    except LookupError:
        return None


def _owned_account(account_id, platform=None):
    sql = "SELECT * FROM " + ACCOUNTS_TABLE + " WHERE id = :id AND business_id = :b"
    params = {"id": account_id, "b": current_business_id()}
    if platform:
        sql += " AND platform = :platform"
        params["platform"] = platform
    try:
        return get_one(sql, params)
    except LookupError:
        return None


def _account_token(account_id):
    """access token or None (no credentials row)."""
    try:
        creds = get_access_token(account_id)
        return creds.get("access_token")
    except LookupError:
        return None
    except Exception:
        return None


def _record_dashboard_event(account_id, event_type, product_id, payload):
    """Claim the audit row and return its id (or None).

    The caller must call finish(event_id) after a successful run or
    fail(event_id) on exception — mirroring the webhook flow, so the audit
    trail only says 'done' when the action really finished.
    """
    external_id = "{}-{}-{}".format(event_type, product_id, uuid.uuid4().hex[:8])
    try:
        return claim(account_id, "dashboard", event_type, external_id,
                     payload, actor_id=current_user().get("id"),
                     actor_role=current_user().get("role"))
    except Exception:
        logger.exception("Could not claim dashboard event %s", event_type)
        return None


def _bad(message, code=400):
    return jsonify({"error": "bad_request", "message": message}), code


def _meli_error(exc):
    logger.exception("Meli API call failed")
    return jsonify({"error": "meli_error", "message": str(exc)}), 502


def _meli_response_error(resp):
    """Mensaje legible de un error de la API de MercadoLibre."""
    try:
        body = resp.json()
        if isinstance(body, dict):
            for key in ("message", "error", "cause"):
                if body.get(key):
                    return "MercadoLibre respondió %d · %s" % (resp.status_code, str(body[key])[:200])
        return "MercadoLibre respondió %d · %s" % (resp.status_code, str(body)[:200])
    except Exception:
        return "MercadoLibre respondió %d" % resp.status_code



# ─── accounts ─────────────────────────────────────────────────────────────────

@channels_bp.route("/accounts", methods=["GET"])
@require_auth
def list_accounts():
    rows = execute_select_accounts()
    return jsonify({"items": rows})


def execute_select_accounts():
    return get_all(
        "SELECT a.id, a.platform, a.external_account_id, a.name,"
        " (SELECT COUNT(*) FROM " + SCHEMA_ACCOUNTS + ".credentials c"
        "  WHERE c.account_id = a.id) AS has_credentials"
        " FROM " + ACCOUNTS_TABLE + " a WHERE a.business_id = :b"
        " ORDER BY a.platform, a.name",
        {"b": current_business_id()})


# ─── MercadoLibre: categories & listing prices ────────────────────────────────

@channels_bp.route("/mercadolibre/categories", methods=["GET"])
@require_auth
def ml_categories():
    q = (request.args.get("q") or "").strip()
    account_id = request.args.get("account_id", type=int)
    if not q:
        return jsonify({"items": []})

    account = _owned_account(account_id, "mercadolibre")
    if account is None:
        return _bad("Cuenta de MercadoLibre no encontrada")
    token = _account_token(account_id)
    if not token:
        return _bad("La cuenta no tiene credenciales de MercadoLibre")

    try:
        resp = requests.get(
            MELI_BASE_URL + "/sites/MLA/domain_discovery/search",
            params={"q": q, "limit": 6},
            headers={"Authorization": "Bearer " + token}, timeout=30)
    except requests.RequestException as exc:
        return _meli_error(exc)
    if resp.status_code != 200:
        return jsonify({"error": "meli_error",
                        "message": _meli_response_error(resp)}), 502

    items = []
    for c in resp.json():
        items.append({
            "id": c.get("category_id"),
            "category_name": c.get("category_name"),
            "domain_id": c.get("domain_id"),
            "domain_name": c.get("domain_name"),
        })
    return jsonify({"items": items})


@channels_bp.route("/mercadolibre/listing-prices", methods=["GET"])
@require_auth
def ml_listing_prices():
    price = request.args.get("price")
    category_id = request.args.get("category_id")
    account_id = request.args.get("account_id", type=int)
    if not price or not category_id:
        return _bad("Faltan price o category_id")

    account = _owned_account(account_id, "mercadolibre")
    if account is None:
        return _bad("Cuenta de MercadoLibre no encontrada")
    token = _account_token(account_id)
    if not token:
        return _bad("La cuenta no tiene credenciales de MercadoLibre")

    try:
        resp = requests.get(
            MELI_BASE_URL + "/sites/MLA/listing_prices",
            params={"price": price, "category_id": category_id},
            headers={"Authorization": "Bearer " + token}, timeout=30)
    except requests.RequestException as exc:
        return _meli_error(exc)
    if resp.status_code != 200:
        return jsonify({"error": "meli_error",
                        "message": _meli_response_error(resp)}), 502

    def _fee_dict(details):
        """La API devuelve fee_details como DICT:
        {fixed_fee, gross_amount, percentage_fee, meli_percentage_fee,
         financing_add_on_fee}. Por las dudas también soportamos listas."""
        if isinstance(details, dict):
            return details
        out = {"fixed_fee": 0.0, "percentage_fee": 0.0,
               "meli_percentage_fee": 0.0, "financing_add_on_fee": 0.0}
        for item in details or []:
            if not isinstance(item, dict):
                continue
            fee_type = (item.get("fee_type") or "").lower()
            if "percent" in fee_type:
                value = float(item.get("percentage") or 0)
                out["percentage_fee"] = float(out["percentage_fee"]) + value
                if "meli" in fee_type:
                    out["meli_percentage_fee"] = float(out["meli_percentage_fee"]) + value
            else:
                out["fixed_fee"] = float(out["fixed_fee"]) + float(item.get("amount") or 0)
        return out

    def _f(value):
        try:
            return float(value or 0)
        except (TypeError, ValueError):
            return 0.0

    items = []
    for d in resp.json():
        sale = _fee_dict(d.get("sale_fee_details"))
        listing = _fee_dict(d.get("listing_fee_details"))
        pct_total = round(_f(sale.get("percentage_fee")), 1)
        meli_pct = round(_f(sale.get("meli_percentage_fee") or sale.get("percentage_fee")), 1)
        financing = round(_f(sale.get("financing_add_on_fee")), 1)
        fixed = round(_f(sale.get("fixed_fee")) + _f(listing.get("fixed_fee")), 2)
        items.append({
            "id": d.get("listing_type_id"),
            "name": d.get("listing_type_name"),
            "sale_fee": _f(d.get("sale_fee_amount")),
            "pct": pct_total,
            "meli_pct": meli_pct,
            "financing": financing,
            "fixed": fixed,
        })
    return jsonify({"items": items})


# ─── MercadoLibre: configure & publish actions ────────────────────────────────

def _ensure_ml_rows(product_id, account_id):
    """Create (if needed) the listing + attributes rows. Returns listing row."""
    execute(
        "INSERT INTO " + ML_LISTINGS_TABLE + " (product_id, account_id)"
        " VALUES (:p, :a) ON DUPLICATE KEY UPDATE account_id = :a",
        {"p": product_id, "a": account_id})
    listing = get_one(
        "SELECT * FROM " + ML_LISTINGS_TABLE + " WHERE product_id = :p",
        {"p": product_id})

    try:
        get_one("SELECT id FROM " + ML_ATTRIBUTES_TABLE
                + " WHERE product_listing_id = :lid",
                {"lid": listing["id"]})
    except LookupError:
        execute(
            "INSERT INTO " + ML_ATTRIBUTES_TABLE
            + " (product_listing_id, category_id, empty_gtin_reason_required,"
            "  empty_gtin_reason, buying_mode, condition_type, currency_id)"
            " VALUES (:lid, NULL, 0, 17055160, 'buy_it_now', 'new', 'ARS')",
            {"lid": listing["id"]})
    return listing


def _ml_settings(product_listing_id):
    row = get_one(
        "SELECT id, category_id, settings FROM " + ML_ATTRIBUTES_TABLE
        + " WHERE product_listing_id = :lid",
        {"lid": product_listing_id})
    raw = row.get("settings")
    try:
        settings = json.loads(raw) if raw else []
    except (TypeError, ValueError):
        settings = []
    return row, settings


def _set_user_value(settings, section, item_id, value):
    for group in settings:
        for key, items in group.items():
            if key == section:
                for item in items:
                    if item.get("id") == item_id:
                        item["user_input_value"] = value


def _set_user_value_anywhere(settings, item_id, value):
    """Set user_input_value on the item regardless of its section."""
    for group in settings:
        for items in group.values():
            if not isinstance(items, list):
                continue
            for item in items:
                if isinstance(item, dict) and item.get("id") == item_id:
                    item["user_input_value"] = value


def _settings_need_rebuild(settings):
    """Settings construidos ANTES de las flags required/catalog_required: se
    reconstruyen para que el front pueda marcar obligatorios/recomendados."""
    for group in settings:
        if not isinstance(group, dict):
            continue
        items = group.get("attributes") or []
        for item in items:
            if isinstance(item, dict) and "required" not in item:
                return True
    return False


def _rebuild_settings_preserving_values(row, old_settings, token, price):
    """Reconstruye los settings desde Meli SIN pisar lo que el usuario ya
    eligió: los items existentes conservan su user_input_value; los nuevos
    (ej. COLOR) entran con las flags y valor vacío."""
    _settings_builder(row["id"], str(row["category_id"]), price, token)
    raw = get_one(
        "SELECT settings FROM " + ML_ATTRIBUTES_TABLE + " WHERE id = :aid",
        {"aid": row["id"]}).get("settings")
    try:
        fresh = json.loads(raw) if raw else []
    except (TypeError, ValueError):
        fresh = []
    for group, old_group in zip(fresh, old_settings):
        if not isinstance(group, dict) or not isinstance(old_group, dict):
            continue
        for key, items in group.items():
            if not isinstance(items, list):
                continue
            old_items = {
                it.get("id"): it
                for it in (old_group.get(key) or [])
                if isinstance(it, dict)
            }
            for item in items:
                old = old_items.get(item.get("id"))
                if old and old.get("user_input_value") not in (None, ""):
                    item["user_input_value"] = old["user_input_value"]
    execute(
        "UPDATE " + ML_ATTRIBUTES_TABLE + " SET settings = :s WHERE id = :aid",
        {"s": json.dumps(fresh), "aid": row["id"]})


@channels_bp.route("/mercadolibre/settings", methods=["GET"])
@require_auth
def ml_settings_get():
    """Current ML wizard state for a product.

    Refresh lazy: si los settings guardados son de antes de las flags
    required/catalog_required, se reconstruyen desde Meli (conservando los
    valores ya elegidos) al abrir el wizard."""
    product_id = request.args.get("product_id", type=int)
    account_id = request.args.get("account_id", type=int)
    product = _owned_product(product_id)
    if product is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
    if _owned_account(account_id, "mercadolibre") is None:
        return _bad("Cuenta de MercadoLibre no encontrada")

    try:
        listing = get_one(
            "SELECT id FROM " + ML_LISTINGS_TABLE + " WHERE product_id = :p",
            {"p": product_id})
        row, settings = _ml_settings(listing["id"])
        if settings and row.get("category_id") and _settings_need_rebuild(settings):
            try:
                token = _account_token(account_id)
                if token:
                    _rebuild_settings_preserving_values(
                        row, settings, token, product.get("price") or 0)
                    _, settings = _ml_settings(listing["id"])
            except Exception:
                logger.exception("Lazy settings rebuild failed for product %s",
                                 product_id)
        return jsonify({
            "category_id": row.get("category_id"),
            "settings": settings,
            # La categoría exige guía de talles (SIZE_GRID_ID aparece en sus
            # settings): el wizard muestra el talle + las medidas y el publish
            # resuelve la guía automáticamente (app/integrations/mercadolibre/
            # size_grid.py).
            "size_grid_required": grid_required(settings),
        })
    except LookupError:
        return jsonify({"category_id": None, "settings": [],
                        "size_grid_required": False})


@channels_bp.route("/mercadolibre/size-grid/measures", methods=["GET"])
@require_auth
def ml_size_grid_measures():
    """Medidas requeridas por la guía de talles de la categoría (para que el
    wizard las muestre como campos numéricos). Se resuelven desde el template
    del dominio de Meli (technical_specs?section=grids)."""
    product_id = request.args.get("product_id", type=int)
    account_id = request.args.get("account_id", type=int)
    gender = (request.args.get("gender") or "").strip()
    product = _owned_product(product_id)
    if product is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
    account = _owned_account(account_id, "mercadolibre")
    if account is None:
        return _bad("Cuenta de MercadoLibre no encontrada")
    token = _account_token(account_id)
    if not token:
        return _bad("La cuenta no tiene credenciales de MercadoLibre")

    try:
        listing = get_one(
            "SELECT id FROM " + ML_LISTINGS_TABLE + " WHERE product_id = :p",
            {"p": product_id})
        row, settings = _ml_settings(listing["id"])
        category_id = row.get("category_id")
    except LookupError:
        return jsonify({"measures": []})
    if not category_id or not gender or not grid_required(settings):
        return jsonify({"measures": []})

    try:
        from app.integrations.mercadolibre.size_grid import (
            _category_domain, _grid_spec)
        domain_id = _category_domain(category_id, token)
        if not domain_id:
            return jsonify({"measures": []})
        _, _, measures, _ = _grid_spec(
            domain_id, gender, product.get("brand") or "Genérico", token)
        return jsonify({"measures": measures})
    except Exception:
        logger.exception("Could not load size grid measures for product %s",
                         product_id)
        return jsonify({"measures": []})


@channels_bp.route("/mercadolibre/configure", methods=["POST"])
@require_auth
def ml_configure():
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    account_id = data.get("account_id")
    category_id = data.get("category_id")
    refresh = bool(data.get("refresh"))

    product = _owned_product(product_id)
    if product is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
    account = _owned_account(account_id, "mercadolibre")
    if account is None:
        return _bad("Cuenta de MercadoLibre no encontrada")
    if not category_id:
        return _bad("Falta category_id")
    token = _account_token(account_id)
    if not token:
        return _bad("La cuenta no tiene credenciales de MercadoLibre")

    listing = _ensure_ml_rows(product_id, account_id)
    attr_row, settings = _ml_settings(listing["id"])

    if not refresh and settings and str(attr_row.get("category_id")) == str(category_id):
        return jsonify({"category_id": attr_row["category_id"], "settings": settings})

    execute(
        "UPDATE " + ML_ATTRIBUTES_TABLE + " SET category_id = :category_id"
        " WHERE product_listing_id = :lid",
        {"category_id": category_id, "lid": listing["id"]})

    price = product.get("price") or 0
    try:
        _settings_builder(attr_row["id"], str(category_id), price, token)
    except Exception as exc:
        logger.exception("_settings_builder failed for product %s", product_id)
        return jsonify({"error": "meli_error",
                        "message": "No se pudieron cargar los atributos: %s" % exc}), 502

    _, settings = _ml_settings(listing["id"])
    return jsonify({"category_id": category_id, "settings": settings})


def _ml_action(event_type, data):
    product_id = data.get("product_id")
    account_id = data.get("account_id")

    product = _owned_product(product_id)
    if product is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
    account = _owned_account(account_id, "mercadolibre")
    if account is None:
        return _bad("Cuenta de MercadoLibre no encontrada")
    token = _account_token(account_id)
    if not token:
        return _bad("La cuenta no tiene credenciales de MercadoLibre")

    _ensure_ml_rows(product_id, account_id)

    payload = {"product_id": product_id, "account_id": account_id,
               "target": "mercadolibre", "event_type": event_type}
    # Payload-of-record: la config completa (modo catálogo, ficha elegida,
    # atributos, etc.) queda en la fila de auditoría para reconstruir cada
    # click sin depender de los logs.
    if isinstance(data.get("config"), dict):
        payload["config"] = data["config"]
    start = time.monotonic()
    outcome = "ok"
    event_id = _record_dashboard_event(account_id, event_type, product_id, payload)
    # Fase 1: todas las líneas de este request quedan etiquetadas con el id
    # de la fila de auditoría -> grep por [event=<id>] en Cloud Logging.
    if event_id:
        set_event_id(event_id)
    try:
        pipeline_publish(payload)
        if event_id:
            finish(event_id)
    except Exception as exc:
        outcome = "error"
        if event_id:
            fail(event_id)
        logger.exception("ML %s failed for product %s", event_type, product_id)
        logger.info("action=%s product=%s target=mercadolibre outcome=error"
                    " duration=%.2fs", event_type, product_id,
                    time.monotonic() - start)
        return jsonify({"error": "meli_error", "message": str(exc)}), 502

    # La pipeline toca listados (incluso en caminos de error parcial):
    # invalidar SIEMPRE y DESPUÉS de la escritura (ver app/cache.py).
    cache.invalidate_business(current_business_id())

    # Tras publicar/actualizar/pausar, sincronizar el estado REAL del item una
    # vez (misma lógica que el webhook de items): Meli responde el estado al
    # instante, así el front no depende de que llegue el webhook para saber
    # si quedó activo, pausado o en revisión. Best-effort: si falla, responde
    # con el estado que ya está en la fila.
    meli_status = None
    sub_status = None
    if event_type in ("publish", "update", "pause"):
        try:
            row = get_one(
                "SELECT meli_id FROM " + ML_LISTINGS_TABLE
                + " WHERE product_id = :p", {"p": product_id})
        except LookupError:
            row = None
        if row and row.get("meli_id"):
            try:
                from app.webhook.item_event import _fetch_item, _update_listing_status
                item = _fetch_item(account, row["meli_id"])
                _update_listing_status(account, row["meli_id"], item)
                meli_status = item.get("status")
                sub_status = item.get("sub_status") or []
            except Exception:
                logger.exception("Could not sync ML item status after %s (product %s)",
                                 event_type, product_id)

    # delete() removes the local listing row on success.
    try:
        listing = get_one(
            "SELECT meli_id, status, reason, remedy, permalink,"
            " catalog_product_id, marketplace_item_id, marketplace_status"
            " FROM " + ML_LISTINGS_TABLE + " WHERE product_id = :p",
            {"p": product_id})
        logger.info(
            "action=%s product=%s target=mercadolibre outcome=%s"
            " db_status=%s meli_status=%s duration=%.2fs",
            event_type, product_id, outcome,
            listing.get("status"), meli_status, time.monotonic() - start)
        return jsonify({
            "status": ml_status_from_db(listing.get("status"), listing.get("reason")),
            "external_id": listing.get("meli_id"),
            "db_status": listing.get("status"),
            "reason": listing.get("reason"),
            "remedy": listing.get("remedy"),
            "permalink": listing.get("permalink"),
            "catalog_listing": bool(listing.get("catalog_product_id")),
            "catalog_product_id": listing.get("catalog_product_id"),
            "marketplace_item_id": listing.get("marketplace_item_id"),
            "marketplace_status": listing.get("marketplace_status"),
            # Estado REAL de Meli tras la acción (para avisos del front, ej.
            # under_review: el cambio de estado se aplica cuando termine la
            # revisión).
            "meli_status": meli_status,
            "sub_status": sub_status,
        })
    except LookupError:
        logger.info(
            "action=%s product=%s target=mercadolibre outcome=%s"
            " db_status=None meli_status=%s duration=%.2fs",
            event_type, product_id, outcome, meli_status,
            time.monotonic() - start)
        return jsonify({"status": "unpublished", "external_id": None,
                        "db_status": None, "reason": None, "remedy": None,
                        "permalink": None,
                        "catalog_listing": False, "catalog_product_id": None,
                        "marketplace_item_id": None, "marketplace_status": None,
                        "meli_status": meli_status,
                        "sub_status": sub_status})


def _apply_ml_config(listing, config):
    """Persist the wizard config into attributes.settings. Returns category_id."""
    attr_row, settings = _ml_settings(listing["id"])

    category_id = config.get("category_id") or attr_row.get("category_id")
    if not category_id:
        raise ValueError("Seleccioná una categoría antes de publicar")

    # Genérico: el front manda {item_id: valor} para TODOS los atributos que
    # renderiza dinámicamente (cada categoría tiene los suyos).
    for item_id, value in (config.get("attributes") or {}).items():
        if value is None:
            continue
        _set_user_value_anywhere(settings, str(item_id), value)

    # Compat con el formato anterior (claves conocidas).
    overrides = {
        ("attributes", "VALUE_ADDED_TAX"): config.get("iva"),
        ("attributes", "IMPORT_DUTY"): config.get("import_duty"),
        ("attributes", "IS_KIT"): _to_bool_str(config.get("is_kit"), true_label="Si", false_label="No"),
        ("shipping", "MODE"): config.get("mode"),
        ("shipping", "LOGISTIC_TYPE"): config.get("logistic_type"),
        ("shipping", "LOCAL_PICK_UP"): _to_bool_str(config.get("local_pickup")),
        ("shipping", "FREE_SHIPPING"): _to_bool_str(config.get("free_shipping")),
        ("sale_terms", "WARRANTY_TYPE"): config.get("warranty_type"),
        ("sale_terms", "WARRANTY_TIME"): config.get("warranty_time"),
        ("listing", "LISTING_TYPE"): config.get("listing_type"),
    }
    for (section, item_id), value in overrides.items():
        if value is not None:
            _set_user_value(settings, section, item_id, value)

    execute(
        "UPDATE " + ML_ATTRIBUTES_TABLE + " SET settings = :settings, category_id = :category_id"
        " WHERE product_listing_id = :lid",
        {"settings": json.dumps(settings, ensure_ascii=False),
         "category_id": str(category_id), "lid": listing["id"]})
    return category_id


@channels_bp.route("/mercadolibre/publish", methods=["POST"])
@require_auth
def ml_publish():
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    account_id = data.get("account_id")
    config = data.get("config") or {}

    product = _owned_product(product_id)
    if product is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
    account = _owned_account(account_id, "mercadolibre")
    if account is None:
        return _bad("Cuenta de MercadoLibre no encontrada")

    listing = _ensure_ml_rows(product_id, account_id)
    try:
        _apply_ml_config(listing, config)
    except ValueError as exc:
        return _bad(str(exc))

    # name_edited: si viene vacío al publicar, se rellena solo con el nombre
    # del producto (fuente de la columna "Producto" del listado).
    execute(
        "UPDATE inventory.products SET name_edited = name"
        " WHERE id = :id AND (name_edited IS NULL OR name_edited = '')",
        {"id": product_id})

    # Catálogo: si el wizard eligió un producto estándar (matching), guardarlo
    # en la fila ANTES de publicar — product_handler lo lee y lo manda en el
    # POST /items (catalog_product_id + catalog_listing: true).
    catalog_product_id = (config.get("catalog_product_id") or "").strip()
    if catalog_product_id:
        execute(
            "UPDATE " + ML_LISTINGS_TABLE
            + " SET catalog_product_id = :cpid WHERE id = :lid",
            {"cpid": catalog_product_id, "lid": listing["id"]})

    return _ml_action("publish", data)


def _to_bool_str(value, true_label="True", false_label="False"):
    # Fuente única de "verdadero": app/integrations/core/bools.is_truthy.
    if value is None:
        return None
    return true_label if is_truthy(value) else false_label


@channels_bp.route("/mercadolibre/price", methods=["PATCH"])
@require_auth
def ml_price():
    """Edita el precio LOCAL de la publicación ML (no dispara update a Meli).

    El usuario gestiona cuándo empuja el precio: la próxima acción
    publicar/actualizar usa este valor (price_manually_changed lo marca).
    """
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    account_id = data.get("account_id")
    if _owned_product(product_id) is None:
        return _bad("Producto no encontrado", 404)
    if _owned_account(account_id, "mercadolibre") is None:
        return _bad("Cuenta de MercadoLibre no encontrada")
    listing = _ensure_ml_rows(product_id, account_id)
    try:
        price_int = int(float(data.get("price")))
    except (TypeError, ValueError):
        return _bad("El precio debe ser numérico")
    if price_int < 0:
        return _bad("El precio no puede ser negativo")
    execute(
        "UPDATE " + ML_LISTINGS_TABLE
        + " SET price = :p, price_manually_changed = 1, price_updated_at = NOW()"
        + " WHERE id = :lid",
        {"p": price_int, "lid": listing["id"]})
    cache.invalidate_business(current_business_id())  # post-escritura (ver cache.py)
    logger.info("ML listing price set locally for product %s: %s",
                product_id, price_int)
    return jsonify({"status": "ok", "price": price_int,
                    "price_manually_changed": True})


@channels_bp.route("/tiendanube/price", methods=["PATCH"])
@require_auth
def tn_price():
    """Edita el precio LOCAL de la publicación de Tienda Nube (sin push)."""
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    account_id = data.get("account_id")
    if _owned_product(product_id) is None:
        return _bad("Producto no encontrado", 404)
    if _owned_account(account_id, "tiendanube") is None:
        return _bad("Cuenta de Tienda Nube no encontrada")
    listing = _ensure_tn_rows(product_id, account_id)
    try:
        price_int = int(float(data.get("price")))
    except (TypeError, ValueError):
        return _bad("El precio debe ser numérico")
    if price_int < 0:
        return _bad("El precio no puede ser negativo")
    execute(
        "UPDATE " + TN_LISTINGS_TABLE
        + " SET price = :p, price_manually_changed = 1, price_updated_at = NOW()"
        + " WHERE id = :lid",
        {"p": price_int, "lid": listing["id"]})
    cache.invalidate_business(current_business_id())  # post-escritura (ver cache.py)
    logger.info("TN listing price set locally for product %s: %s",
                product_id, price_int)
    return jsonify({"status": "ok", "price": price_int,
                    "price_manually_changed": True})


# ─── Catálogo: matching / elegibilidad / opt-in / opt-out ─────────────────────

def _catalog_optin_error(resp):
    """Mensaje legible para los errores típicos del opt-in de catálogo.

    Meli suele responder 400 con `{"message": "Validation error"}` y el detalle
    real en `cause[]`: preferimos el cause con mensaje (o un mapeo conocido)
    antes de caer al mensaje genérico (que no sirve para debuggear).
    """
    try:
        body = resp.json() or {}
    except Exception:
        body = {}
    if resp.status_code == 417:
        return "El producto de catálogo no corresponde a la categoría de la publicación"
    cause = body.get("cause") if isinstance(body, dict) else None
    codes = []
    cause_message = None
    if isinstance(cause, list):
        for c in cause:
            if not isinstance(c, dict):
                continue
            if c.get("code"):
                codes.append(c["code"])
            if c.get("message") and cause_message is None:
                cause_message = str(c["message"])
    if "item.catalog_listing.not_eligible" in codes:
        return "La publicación no es elegible para el catálogo"
    if "catalog_product_id.invalid" in codes:
        return ("Esa ficha de catálogo no corresponde a la categoría del "
                "producto (dominio distinto). Elegí una ficha del mismo rubro.")
    if resp.status_code == 404:
        return "El producto de catálogo no está activo o no existe"
    if cause_message:
        return "MercadoLibre rechazó el vínculo: " + cause_message[:200]
    return _meli_response_error(resp)


@channels_bp.route("/mercadolibre/catalog/search", methods=["GET"])
@require_auth
def ml_catalog_search():
    """Busca productos estándar de catálogo (por nombre o por GTIN)."""
    account_id = request.args.get("account_id", type=int)
    if _owned_account(account_id, "mercadolibre") is None:
        return _bad("Cuenta de MercadoLibre no encontrada")
    token = _account_token(account_id)
    if not token:
        return _bad("La cuenta no tiene credenciales de MercadoLibre")

    q = (request.args.get("q") or "").strip()
    gtin = (request.args.get("product_identifier") or "").strip()
    if not q and not gtin:
        return _bad("Buscá por nombre (q) o por GTIN (product_identifier)")

    params = {"status": "active", "site_id": "MLA"}
    if q:
        params["q"] = q
    if gtin:
        params["product_identifier"] = gtin
    # Opcional: filtrar por dominio (evita fichas de otro rubro que Meli
    # rechaza con catalog_product_id.invalid).
    domain_id = (request.args.get("domain_id") or "").strip()
    if domain_id:
        params["domain_id"] = domain_id
    try:
        resp = _meli_request("GET", MELI_BASE_URL + "/products/search",
                             token, params=params, timeout=30)
    except Exception as exc:
        return _meli_error(exc)
    if resp.status_code != 200:
        return jsonify({"error": "meli_error",
                        "message": _meli_response_error(resp)}), 502

    body = resp.json() or {}
    items = []
    for r in body.get("results") or []:
        if not isinstance(r, dict):
            continue
        items.append({
            "id": r.get("id"),
            "name": r.get("name"),
            "domain_id": r.get("domain_id"),
            "status": r.get("status"),
            "listing_strategy": (r.get("settings") or {}).get("listing_strategy"),
            "attributes": r.get("attributes") or [],
        })
    return jsonify({"items": items, "total": len(items)})


@channels_bp.route("/mercadolibre/catalog/eligibility", methods=["GET"])
@require_auth
def ml_catalog_eligibility():
    """Estado de elegibilidad de una publicación para el catálogo."""
    product_id = request.args.get("product_id", type=int)
    account_id = request.args.get("account_id", type=int)
    if _owned_product(product_id) is None:
        return _bad("Producto no encontrado", 404)
    account = _owned_account(account_id, "mercadolibre")
    if account is None:
        return _bad("Cuenta de MercadoLibre no encontrada")
    token = _account_token(account_id)
    if not token:
        return _bad("La cuenta no tiene credenciales de MercadoLibre")

    listing = _ensure_ml_rows(product_id, account_id)
    meli_id = listing.get("meli_id")
    if not meli_id:
        return _bad("El producto todavía no está publicado")

    try:
        resp = _meli_request(
            "GET", MELI_BASE_URL + "/items/" + str(meli_id) + "/catalog_listing_eligibility",
            token, timeout=30)
    except Exception as exc:
        return _meli_error(exc)
    if resp.status_code != 200:
        return jsonify({"error": "meli_error",
                        "message": _meli_response_error(resp)}), 502

    body = resp.json() or {}
    return jsonify({
        "id": body.get("id"),
        "status": body.get("status"),
        "buy_box_eligible": body.get("buy_box_eligible"),
        "reason": body.get("reason"),
        "variations": body.get("variations"),
    })


@channels_bp.route("/mercadolibre/catalog/competition", methods=["GET"])
@require_auth
def ml_catalog_competition():
    """Estado de competencia del item en su producto de catálogo (buy box).

    GET /items/{id}/price_to_win?version=v2: status (winning /
    sharing_first_place / competing / listed), price_to_win, boosts del
    ganador y motivos cuando no puede competir. Solo para items en catálogo.
    """
    product_id = request.args.get("product_id", type=int)
    account_id = request.args.get("account_id", type=int)
    if _owned_product(product_id) is None:
        return _bad("Producto no encontrado", 404)
    account = _owned_account(account_id, "mercadolibre")
    if account is None:
        return _bad("Cuenta de MercadoLibre no encontrada")
    token = _account_token(account_id)
    if not token:
        return _bad("La cuenta no tiene credenciales de MercadoLibre")

    listing = _ensure_ml_rows(product_id, account_id)
    meli_id = listing.get("meli_id")
    if not meli_id:
        return _bad("El producto todavía no está publicado")
    if not listing.get("catalog_product_id"):
        return jsonify({"error": "not_catalog",
                        "message": "El producto no está vinculado al catálogo"}), 409

    try:
        resp = _meli_request(
            "GET", MELI_BASE_URL + "/items/" + str(meli_id) + "/price_to_win",
            token, params={"version": "v2"}, timeout=30)
    except Exception as exc:
        return _meli_error(exc)
    if resp.status_code != 200:
        return jsonify({"error": "meli_error",
                        "message": _meli_response_error(resp)}), 502

    body = resp.json() or {}
    boosts = []
    for b in body.get("boosts") or []:
        if isinstance(b, dict):
            boosts.append({"id": b.get("id"), "status": b.get("status"),
                           "description": b.get("description")})
    winner = body.get("winner") if isinstance(body.get("winner"), dict) else None
    return jsonify({
        "status": body.get("status"),
        "current_price": body.get("current_price"),
        "price_to_win": body.get("price_to_win"),
        "currency_id": body.get("currency_id"),
        "visit_share": body.get("visit_share"),
        "competitors_sharing_first_place": body.get("competitors_sharing_first_place"),
        "reason": body.get("reason"),
        "catalog_product_id": body.get("catalog_product_id"),
        "winner": winner,
        "boosts": boosts,
    })


@channels_bp.route("/mercadolibre/catalog/optin", methods=["POST"])
@require_auth
def ml_catalog_optin():
    """Vincula una publicación tradicional a un producto de catálogo."""
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    account_id = data.get("account_id")
    catalog_product_id = (data.get("catalog_product_id") or "").strip()

    if _owned_product(product_id) is None:
        return _bad("Producto no encontrado", 404)
    account = _owned_account(account_id, "mercadolibre")
    if account is None:
        return _bad("Cuenta de MercadoLibre no encontrada")
    token = _account_token(account_id)
    if not token:
        return _bad("La cuenta no tiene credenciales de MercadoLibre")
    if not catalog_product_id:
        return _bad("Elegí un producto de catálogo para vincular")

    listing = _ensure_ml_rows(product_id, account_id)
    meli_id = listing.get("meli_id")
    if not meli_id:
        return _bad("El producto todavía no está publicado")
    if listing.get("catalog_product_id"):
        return jsonify({"error": "already_catalog",
                        "message": "El producto ya está vinculado al catálogo"}), 409

    payload = {"product_id": product_id, "account_id": account_id,
               "target": "mercadolibre", "event_type": "catalog_optin",
               "catalog_product_id": catalog_product_id}
    event_id = _record_dashboard_event(account_id, "catalog_optin", product_id, payload)
    if event_id:
        set_event_id(event_id)

    try:
        resp = _meli_request(
            "POST", MELI_BASE_URL + "/items/catalog_listings",
            token, json_body={"item_id": str(meli_id),
                              "catalog_product_id": catalog_product_id},
            timeout=30)
    except Exception as exc:
        if event_id:
            fail(event_id)
        logger.info("action=catalog_optin product=%s target=mercadolibre"
                    " outcome=error", product_id)
        return _meli_error(exc)

    if resp.status_code >= 300:
        if event_id:
            fail(event_id)
        logger.error("Catalog optin rejected (raw): %s", resp.text[:3000])
        logger.info("action=catalog_optin product=%s target=mercadolibre"
                    " outcome=rejected status=%s", product_id,
                    resp.status_code)
        return jsonify({"error": "catalog_optin_failed",
                        "message": _catalog_optin_error(resp)}), 502

    body = resp.json() or {}
    new_meli_id = body.get("id")
    if not new_meli_id:
        if event_id:
            fail(event_id)
        return _bad("MercadoLibre no devolvió la nueva publicación de catálogo")

    # Estado actual de la tradicional (queda como sombra) — best-effort.
    shadow_status = None
    try:
        from app.webhook.item_event import _fetch_item
        shadow_item = _fetch_item(account, meli_id)
        shadow_status = shadow_item.get("status")
    except Exception:
        logger.exception("Could not fetch shadow status for %s", meli_id)

    # Swap: la principal pasa a ser la de catálogo; la tradicional queda
    # registrada como sombra con su estado.
    execute(
        "UPDATE " + ML_LISTINGS_TABLE
        + " SET meli_id = :new_id, catalog_product_id = :cpid,"
        + " marketplace_item_id = :old_id, marketplace_status = :st,"
        + " status = 'Procesando..', reason = NULL, remedy = NULL"
        + " WHERE id = :lid",
        {"new_id": str(new_meli_id), "cpid": catalog_product_id,
         "old_id": str(meli_id), "st": shadow_status, "lid": listing["id"]})
    cache.invalidate_business(current_business_id())  # post-escritura (ver cache.py)

    # Sincronizar el estado REAL del nuevo item de catálogo al instante:
    # Meli suele arrancarlo PAUSADO mientras lo procesa/moda, y el front debe
    # ver esa realidad (con su botón "Reactivar") en vez de un estado falso.
    try:
        from app.webhook.item_event import _fetch_item, _update_listing_status
        new_item = _fetch_item(account, new_meli_id)
        _update_listing_status(account, new_meli_id, new_item)
    except Exception:
        logger.exception("Could not sync status after catalog optin for %s", new_meli_id)

    if event_id:
        finish(event_id)
    logger.info("Catalog optin done: %s -> %s (%s)",
                meli_id, new_meli_id, catalog_product_id)
    logger.info("action=catalog_optin product=%s target=mercadolibre"
                " outcome=ok", product_id)
    return jsonify({"status": "ok", "external_id": str(new_meli_id),
                    "catalog_product_id": catalog_product_id,
                    "marketplace_item_id": str(meli_id)})


@channels_bp.route("/mercadolibre/catalog/optout", methods=["POST"])
@require_auth
def ml_catalog_optout():
    """Saca la publicación del catálogo y vuelve a venderla como tradicional."""
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    account_id = data.get("account_id")

    if _owned_product(product_id) is None:
        return _bad("Producto no encontrado", 404)
    account = _owned_account(account_id, "mercadolibre")
    if account is None:
        return _bad("Cuenta de MercadoLibre no encontrada")
    token = _account_token(account_id)
    if not token:
        return _bad("La cuenta no tiene credenciales de MercadoLibre")

    listing = _ensure_ml_rows(product_id, account_id)
    meli_id = listing.get("meli_id")
    shadow = listing.get("marketplace_item_id")
    if not listing.get("catalog_product_id"):
        return jsonify({"error": "not_catalog",
                        "message": "El producto no está vinculado al catálogo"}), 409
    if not meli_id:
        return _bad("El producto no tiene publicación")
    if not shadow:
        return jsonify({
            "error": "no_marketplace_item",
            "message": ("Esta publicación nació en el catálogo y no tiene una "
                        "publicación tradicional a la que volver. Para venderla "
                        "como tradicional tenés que publicarla de nuevo."),
        }), 400

    payload = {"product_id": product_id, "account_id": account_id,
               "target": "mercadolibre", "event_type": "catalog_optout"}
    event_id = _record_dashboard_event(account_id, "catalog_optout", product_id, payload)
    if event_id:
        set_event_id(event_id)

    # 1) Cerrar la publicación de catálogo.
    try:
        resp = _meli_request("PUT", MELI_BASE_URL + "/items/" + str(meli_id),
                             token, json_body={"status": "closed"}, timeout=30)
    except Exception as exc:
        if event_id:
            fail(event_id)
        logger.info("action=catalog_optout product=%s target=mercadolibre"
                    " outcome=error", product_id)
        return _meli_error(exc)
    if resp.status_code not in (200, 404):
        if event_id:
            fail(event_id)
        logger.error("Catalog optout rejected (raw): %s", resp.text[:3000])
        logger.info("action=catalog_optout product=%s target=mercadolibre"
                    " outcome=rejected status=%s", product_id,
                    resp.status_code)
        return jsonify({"error": "catalog_optout_failed",
                        "message": _meli_response_error(resp)}), 502

    # 2) Reactivar la publicación tradicional.
    try:
        resp2 = _meli_request("PUT", MELI_BASE_URL + "/items/" + str(shadow),
                              token, json_body={"status": "active"}, timeout=30)
    except Exception as exc:
        if event_id:
            fail(event_id)
        return _meli_error(exc)
    if resp2.status_code not in (200, 404):
        if event_id:
            fail(event_id)
        return jsonify({"error": "catalog_optout_failed",
                        "message": ("No se pudo reactivar la publicación tradicional. "
                                    + _meli_response_error(resp2))}), 502

    # 3) Swap inverso: la tradicional vuelve a ser la principal.
    execute(
        "UPDATE " + ML_LISTINGS_TABLE
        + " SET meli_id = :old_id, catalog_product_id = NULL,"
        + " marketplace_item_id = NULL, marketplace_status = NULL"
        + " WHERE id = :lid",
        {"old_id": str(shadow), "lid": listing["id"]})
    cache.invalidate_business(current_business_id())  # post-escritura (ver cache.py)

    # 4) Sincronizar el estado real de la publicación tradicional.
    try:
        from app.webhook.item_event import _fetch_item, _update_listing_status
        item = _fetch_item(account, shadow)
        _update_listing_status(account, shadow, item)
    except Exception:
        logger.exception("Could not sync status after optout for %s", shadow)

    if event_id:
        finish(event_id)
    logger.info("Catalog optout done: %s back to %s", meli_id, shadow)
    logger.info("action=catalog_optout product=%s target=mercadolibre"
                " outcome=ok", product_id)
    return jsonify({"status": "ok", "external_id": str(shadow)})


@channels_bp.route("/mercadolibre/update", methods=["POST"])
@require_auth
def ml_update():
    data = request.get_json(silent=True) or {}
    config = data.get("config")
    if config:
        # "Actualizar" flow: persistir la config del wizard y sincronizar.
        product_id = data.get("product_id")
        account_id = data.get("account_id")
        if _owned_product(product_id) is None:
            return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
        if _owned_account(account_id, "mercadolibre") is None:
            return _bad("Cuenta de MercadoLibre no encontrada")
        listing = _ensure_ml_rows(product_id, account_id)
        try:
            _apply_ml_config(listing, config)
        except ValueError as exc:
            return _bad(str(exc))
    return _ml_action("update", data)


@channels_bp.route("/mercadolibre/pause", methods=["POST"])
@require_auth
def ml_pause():
    return _ml_action("pause", request.get_json(silent=True) or {})


@channels_bp.route("/mercadolibre/delete", methods=["POST"])
@require_auth
def ml_delete():
    return _ml_action("delete", request.get_json(silent=True) or {})


@channels_bp.route("/mercadolibre/performance", methods=["GET"])
@require_auth
def ml_performance():
    """MercadoLibre item health/performance (mercadolibre.performance table)."""
    product_id = request.args.get("product_id", type=int)
    account_id = request.args.get("account_id", type=int)

    if _owned_product(product_id) is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
    if _owned_account(account_id, "mercadolibre") is None:
        return _bad("Cuenta de MercadoLibre no encontrada")

    empty = {"score": None, "level": None, "level_wording": None,
             "updated_at": None, "buckets": []}

    try:
        listing = get_one(
            "SELECT id FROM " + ML_LISTINGS_TABLE + " WHERE product_id = :p",
            {"p": product_id})
    except LookupError:
        return jsonify(empty)

    try:
        row = get_one(
            "SELECT score, level, level_wording, buckets, updated_at"
            " FROM mercadolibre.performance WHERE product_listing_id = :lid",
            {"lid": listing["id"]})
    except LookupError:
        return jsonify(empty)

    raw = row.get("buckets")
    try:
        buckets = json.loads(raw) if raw else []
    except (TypeError, ValueError):
        buckets = []

    return jsonify({
        "score": row.get("score"),
        "level": row.get("level"),
        "level_wording": row.get("level_wording"),
        "updated_at": _serializable(row.get("updated_at")),
        "buckets": buckets,
    })


PERFORMANCE_TABLE = "mercadolibre.performance"


@channels_bp.route("/mercadolibre/performance/refresh", methods=["POST"])
@require_auth
def ml_performance_refresh():
    """Pide a Meli la performance del item (GET /item/{id}/performance) y la
    guarda en mercadolibre.performance (upsert por product_listing_id).

    Meli solo calcula performance para items ACTIVOS (400 si no lo está) y
    puede devolver 404 si todavía no la calculó: ambos casos se responden con
    un mensaje claro para el botón manual del front.
    """
    data = request.get_json(silent=True) or {}
    try:
        product_id = int(data.get("product_id"))
        account_id = int(data.get("account_id"))
    except (TypeError, ValueError):
        return _bad("product_id y account_id son obligatorios")

    if _owned_product(product_id) is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
    account = _owned_account(account_id, "mercadolibre")
    if account is None:
        return _bad("Cuenta de MercadoLibre no encontrada")
    token = _account_token(account_id)
    if not token:
        return _bad("La cuenta no tiene credenciales de MercadoLibre")

    try:
        listing = get_one(
            "SELECT id, meli_id FROM " + ML_LISTINGS_TABLE + " WHERE product_id = :p",
            {"p": product_id})
    except LookupError:
        return jsonify({"error": "not_published",
                        "message": "La publicación no tiene item de MercadoLibre"}), 400
    meli_id = listing.get("meli_id")
    if not meli_id:
        return jsonify({"error": "not_published",
                        "message": "La publicación no tiene item de MercadoLibre"}), 400

    try:
        resp = _meli_request(
            "GET", MELI_BASE_URL + "/item/" + str(meli_id) + "/performance",
            token, timeout=30)
    except requests.RequestException as exc:
        return _meli_error(exc)

    if resp.status_code == 404:
        return jsonify({"error": "not_calculated",
                        "message": "MercadoLibre todavía está calculando la performance "
                                   "de esta publicación — probá de nuevo en unos segundos."}), 400
    if resp.status_code == 400:
        # Meli usa 400 para dos cosas distintas: item no activo, o "Entity not
        # calculated: Product items are not supported" en items de catálogo
        # (que NUNCA tienen performance). Mensajes separados para cada caso.
        try:
            body400 = resp.json() or {}
            detail = (str(body400.get("message") or "") + " "
                      + str(body400.get("error") or "")).lower()
        except Exception:
            detail = ""
        if "not supported" in detail or "not calculated" in detail:
            return jsonify({"error": "not_supported",
                            "message": "MercadoLibre no calcula la performance para "
                                       "publicaciones de catálogo."}), 400
        return jsonify({"error": "not_active",
                        "message": "MercadoLibre calcula la performance solo para "
                                   "publicaciones activas."}), 400
    if resp.status_code != 200:
        return jsonify({"error": "meli_error",
                        "message": _meli_response_error(resp)}), 502

    body = resp.json() or {}
    try:
        score = int(round(float(body.get("score") or 0)))
    except (TypeError, ValueError):
        score = 0
    buckets = body.get("buckets") or []

    execute(
        "INSERT INTO " + PERFORMANCE_TABLE
        + " (product_listing_id, entity_type, score, level, level_wording, buckets)"
        + " VALUES (:lid, :entity_type, :score, :level, :level_wording, :buckets)"
        + " ON DUPLICATE KEY UPDATE entity_type = :entity_type, score = :score,"
        + "  level = :level, level_wording = :level_wording, buckets = :buckets",
        {"lid": listing["id"], "entity_type": body.get("entity_type"),
         "score": score, "level": body.get("level"),
         "level_wording": body.get("level_wording"),
         "buckets": json.dumps(buckets, ensure_ascii=False)})
    # La performance viaja en las filas cacheadas de la vista ML: invalidar
    # DESPUÉS de la escritura (ver app/cache.py).
    cache.invalidate_business(current_business_id())

    row = get_one(
        "SELECT score, level, level_wording, buckets, updated_at"
        " FROM " + PERFORMANCE_TABLE + " WHERE product_listing_id = :lid",
        {"lid": listing["id"]})
    raw = row.get("buckets")
    try:
        buckets_out = json.loads(raw) if raw else []
    except (TypeError, ValueError):
        buckets_out = []
    return jsonify({
        "score": row.get("score"),
        "level": row.get("level"),
        "level_wording": row.get("level_wording"),
        "updated_at": _serializable(row.get("updated_at")),
        "buckets": buckets_out,
    })


# ─── Tienda Nube ──────────────────────────────────────────────────────────────

def _ensure_tn_rows(product_id, account_id):
    execute(
        "INSERT INTO " + TN_LISTINGS_TABLE + " (product_id, account_id)"
        " VALUES (:p, :a) ON DUPLICATE KEY UPDATE account_id = :a",
        {"p": product_id, "a": account_id})
    listing = get_one(
        "SELECT * FROM " + TN_LISTINGS_TABLE + " WHERE product_id = :p",
        {"p": product_id})

    try:
        get_one("SELECT id FROM " + TN_ATTRIBUTES_TABLE
                + " WHERE product_listing_id = :lid", {"lid": listing["id"]})
    except LookupError:
        execute(
            "INSERT INTO " + TN_ATTRIBUTES_TABLE + " (product_listing_id, settings)"
            " VALUES (:lid, :settings)",
            {"lid": listing["id"],
             "settings": json.dumps(TN_DEFAULT_SETTINGS, ensure_ascii=False)})
    return listing


def _tn_settings(product_listing_id):
    row = get_one(
        "SELECT id, settings FROM " + TN_ATTRIBUTES_TABLE
        + " WHERE product_listing_id = :lid", {"lid": product_listing_id})
    try:
        settings = json.loads(row.get("settings")) if row.get("settings") else {}
    except (TypeError, ValueError):
        settings = {}
    return row, settings


@channels_bp.route("/tiendanube/settings", methods=["GET"])
@require_auth
def tn_settings_get():
    """Current TN wizard state for a product (no side effects)."""
    product_id = request.args.get("product_id", type=int)
    account_id = request.args.get("account_id", type=int)
    if _owned_product(product_id) is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
    if _owned_account(account_id, "tiendanube") is None:
        return _bad("Cuenta de Tienda Nube no encontrada")

    try:
        listing = get_one(
            "SELECT id FROM " + TN_LISTINGS_TABLE + " WHERE product_id = :p",
            {"p": product_id})
        _, settings = _tn_settings(listing["id"])
    except LookupError:
        settings = {}
    merged = dict(TN_DEFAULT_SETTINGS)
    merged.update(settings)
    # Normaliza alias viejos de género/edad a su label canónico (los alias se
    # siguen aceptando al guardar, pero la UI muestra siempre el canónico).
    for key, normalizer in (("GENDER", normalize_tn_gender),
                            ("AGE_GROUP", normalize_tn_age_group)):
        entry = merged.get(key)
        if isinstance(entry, dict) and entry.get("USER_INPUT_VALUE"):
            entry["USER_INPUT_VALUE"] = normalizer(entry["USER_INPUT_VALUE"])
    return jsonify({
        "settings": merged,
        "gender_options": TN_GENDER_OPTIONS,
        "age_group_options": TN_AGE_GROUP_OPTIONS,
    })


def _apply_tn_config(listing, config):
    """Persist the TN wizard config into attributes.settings."""
    _, settings = _tn_settings(listing["id"])

    mapping = {
        "FREE_SHIPPING": config.get("free_shipping"),
        "PROMOTIONAL_PRICE": config.get("promo_price"),
        "AGE_GROUP": config.get("age_group"),
        "GENDER": config.get("gender"),
        "MPN": config.get("mpn"),
        "BARCODE": config.get("barcode"),
        "TAGS": config.get("tags"),
        "VIDEO_URL": config.get("video_url"),
        "SEO_TITLE": config.get("seo_title"),
        "SEO_DESCRIPTION": config.get("seo_description"),
    }
    for key, value in mapping.items():
        if value is not None:
            entry = settings.setdefault(
                key, {"DEFAULT_VALUE": None, "USER_INPUT_VALUE": None})
            entry["USER_INPUT_VALUE"] = value

    execute(
        "UPDATE " + TN_ATTRIBUTES_TABLE + " SET settings = :settings"
        " WHERE product_listing_id = :lid",
        {"settings": json.dumps(settings, ensure_ascii=False),
         "lid": listing["id"]})


@channels_bp.route("/tiendanube/publish", methods=["POST"])
@require_auth
def tn_publish():
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    account_id = data.get("account_id")
    config = data.get("config") or {}

    product = _owned_product(product_id)
    if product is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
    account = _owned_account(account_id, "tiendanube")
    if account is None:
        return _bad("Cuenta de Tienda Nube no encontrada")

    listing = _ensure_tn_rows(product_id, account_id)
    _apply_tn_config(listing, config)

    # name_edited: igual que ML — si viene vacío al publicar, se rellena solo.
    execute(
        "UPDATE inventory.products SET name_edited = name"
        " WHERE id = :id AND (name_edited IS NULL OR name_edited = '')",
        {"id": product_id})

    payload = {"product_id": product_id, "account_id": account_id,
               "target": "tiendanube", "event_type": "publish"}
    # Payload-of-record: config completa en la fila de auditoría.
    if isinstance(config, dict):
        payload["config"] = config
    start = time.monotonic()
    outcome = "ok"
    event_id = _record_dashboard_event(account_id, "publish", product_id, payload)
    if event_id:
        set_event_id(event_id)
    try:
        create_categories(payload)
        pipeline_publish(payload)
        if event_id:
            finish(event_id)
    except Exception as exc:
        outcome = "error"
        if event_id:
            fail(event_id)
        logger.exception("TN publish failed for product %s", product_id)
        logger.info("action=publish product=%s target=tiendanube"
                    " outcome=error duration=%.2fs", product_id,
                    time.monotonic() - start)
        return jsonify({"error": "tiendanube_error", "message": str(exc)}), 502

    # La pipeline toca listados/producto incluso en caminos de error parcial:
    # invalidar SIEMPRE y DESPUÉS de la escritura (ver app/cache.py).
    cache.invalidate_business(current_business_id())

    listing = get_one(
        "SELECT tnube_id, status, reason, remedy, permalink FROM "
        + TN_LISTINGS_TABLE + " WHERE product_id = :p",
        {"p": product_id})
    logger.info("action=publish product=%s target=tiendanube outcome=%s"
                " db_status=%s duration=%.2fs", product_id, outcome,
                listing.get("status"), time.monotonic() - start)
    return jsonify({
        "status": tn_status_from_db(listing.get("status"), listing.get("reason")),
        "external_id": listing.get("tnube_id"),
        "db_status": listing.get("status"),
        "reason": listing.get("reason"),
        "remedy": listing.get("remedy"),
        "permalink": listing.get("permalink"),
    })


def _tn_action(event_type, data):
    product_id = data.get("product_id")
    account_id = data.get("account_id")

    product = _owned_product(product_id)
    if product is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
    account = _owned_account(account_id, "tiendanube")
    if account is None:
        return _bad("Cuenta de Tienda Nube no encontrada")

    _ensure_tn_rows(product_id, account_id)

    payload = {"product_id": product_id, "account_id": account_id,
               "target": "tiendanube", "event_type": event_type}
    start = time.monotonic()
    outcome = "ok"
    event_id = _record_dashboard_event(account_id, event_type, product_id, payload)
    if event_id:
        set_event_id(event_id)
    try:
        pipeline_publish(payload)
        if event_id:
            finish(event_id)
    except Exception as exc:
        outcome = "error"
        if event_id:
            fail(event_id)
        logger.exception("TN %s failed for product %s", event_type, product_id)
        logger.info("action=%s product=%s target=tiendanube outcome=error"
                    " duration=%.2fs", event_type, product_id,
                    time.monotonic() - start)
        return jsonify({"error": "tiendanube_error", "message": str(exc)}), 502

    # La pipeline toca listados/producto incluso en caminos de error parcial:
    # invalidar SIEMPRE y DESPUÉS de la escritura (ver app/cache.py).
    cache.invalidate_business(current_business_id())

    try:
        listing = get_one(
            "SELECT tnube_id, status, reason, remedy, permalink FROM "
            + TN_LISTINGS_TABLE + " WHERE product_id = :p",
            {"p": product_id})
        logger.info("action=%s product=%s target=tiendanube outcome=%s"
                    " db_status=%s duration=%.2fs", event_type, product_id,
                    outcome, listing.get("status"),
                    time.monotonic() - start)
        return jsonify({
            "status": tn_status_from_db(listing.get("status"), listing.get("reason")),
            "external_id": listing.get("tnube_id"),
            "db_status": listing.get("status"),
            "reason": listing.get("reason"),
            "remedy": listing.get("remedy"),
            "permalink": listing.get("permalink"),
        })
    except LookupError:
        return jsonify({"status": "unpublished", "external_id": None,
                        "db_status": None, "reason": None, "remedy": None,
                        "permalink": None})


@channels_bp.route("/tiendanube/update", methods=["POST"])
@require_auth
def tn_update():
    data = request.get_json(silent=True) or {}
    config = data.get("config")
    if config:
        # "Actualizar" flow: persistir la config del wizard y sincronizar.
        product_id = data.get("product_id")
        account_id = data.get("account_id")
        if _owned_product(product_id) is None:
            return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
        if _owned_account(account_id, "tiendanube") is None:
            return _bad("Cuenta de Tienda Nube no encontrada")
        listing = _ensure_tn_rows(product_id, account_id)
        _apply_tn_config(listing, config)
    return _tn_action("update", data)


@channels_bp.route("/tiendanube/delete", methods=["POST"])
@require_auth
def tn_delete():
    return _tn_action("delete", request.get_json(silent=True) or {})


# ─── Publicaciones por canal (vistas Inventario > MercadoLibre / Tienda Nube) ──

ML_LISTED_STATUS_SQL = (
    "ml.status IN ('active','Active','Updated.','paused','Paused.')"
    " OR ml.status LIKE 'Procesando%'"
    # under_review = Meli está moderando el item: la publicación existe y
    # debe verse en la vista (mismo criterio que inventory.py, que lo mapea
    # a 'prepublished').
    " OR ml.status LIKE 'under_review%'"
)
TN_LISTED_STATUS_SQL = (
    "tn.status IN ('Published','Updated.','published','active','paused','Paused.')"
    " OR tn.status LIKE 'Procesando%'"
)

IMAGE_SUBQUERY_SQL = (
    "(SELECT i.url FROM inventory.product_images i"
    " WHERE i.product_id = p.id ORDER BY i.id LIMIT 1) AS image_url"
)


def _page_args():
    try:
        page = max(1, int(request.args.get("page") or 1))
        page_size = min(200, max(1, int(request.args.get("page_size") or 50)))
    except ValueError:
        raise LookupError("Paginación inválida")
    return page, page_size


def _pages_for(total, page_size):
    """ceil(total/page_size) para enteros no negativos."""
    return (total + page_size - 1) // page_size if total else 0


@channels_bp.route("/mercadolibre/listings", methods=["GET"])
@require_auth
def ml_listings():
    """Publicaciones de MercadoLibre del business (tabla de la vista ML)."""
    q = (request.args.get("q") or "").strip()
    status = (request.args.get("status") or "").strip()
    perf = (request.args.get("perf") or "").strip()
    category = (request.args.get("category") or "").strip()
    try:
        page, page_size = _page_args()
    except LookupError as exc:
        return jsonify({"error": "bad_request", "message": str(exc)}), 400

    business_id = current_business_id()

    # Filas + total: cache corta por (filtros, página) — la query pesada
    # (4 LEFT JOINs) se paga una sola vez por combinación.
    rows_payload = cache.get_or_compute(
        business_id, "ml_listings_rows", TTL_ML_ROWS,
        lambda: _ml_listings_rows_payload(
            business_id, q, status, perf, category, page, page_size),
        q, status, perf, category, page, page_size)

    # Resumen (listed/published/paused/avg_perf): otro scope (TODO el negocio,
    # sin filtros) -> cache corta invalidada por versión del business
    # (publish/pause/delete/price, webhooks de items, price_suggestions y
    # performance refresh). Mismo TTL que las filas: refrescan juntos.
    def _compute_summary():
        row = get_one(
            "SELECT COUNT(*) AS listed,"
            " SUM(CASE WHEN ml.status IN ('active','Active','Updated.') THEN 1 ELSE 0 END) AS published,"
            " SUM(CASE WHEN ml.status IN ('paused','Paused.') THEN 1 ELSE 0 END) AS paused,"
            " AVG(perf.score) AS avg_perf"
            " FROM inventory.products p"
            " JOIN mercadolibre.product_listings ml ON ml.product_id = p.id"
            " LEFT JOIN mercadolibre.performance perf ON perf.product_listing_id = ml.id"
            " WHERE p.business_id = :b AND (" + ML_LISTED_STATUS_SQL + ")",
            {"b": business_id})
        avg = row.get("avg_perf")
        return {
            "listed": int(row["listed"] or 0),
            "published": int(row["published"] or 0),
            "paused": int(row["paused"] or 0),
            "avg_perf": round(float(avg), 1) if avg is not None else None,
        }

    summary = cache.get_or_compute(
        business_id, "ml_listings_summary", TTL_ML_SUMMARY,
        _compute_summary)
    return jsonify(dict(rows_payload, summary=summary))


def _ml_listings_rows_payload(business_id, q, status, perf, category, page,
                              page_size):
    """Filas + total de la vista ML (cacheable, sin request context)."""
    like_q = "%" + q + "%"
    filters = (
        " WHERE p.business_id = :b"
        " AND (" + ML_LISTED_STATUS_SQL + ")"
        " AND (:q = '' OR p.name LIKE :like_q OR p.internal_code LIKE :like_q OR p.sku LIKE :like_q)"
        " AND (:category = '' OR p.category = :category)"
        " AND (:status = ''"
        "   OR (:status = 'published' AND ml.status IN ('active','Active','Updated.'))"
        "   OR (:status = 'paused' AND ml.status IN ('paused','Paused.'))"
        "   OR (:status = 'prepublished' AND ml.status LIKE 'Procesando%')"
        "   OR (:status = 'under_review' AND ml.status LIKE 'under_review%'))"
    )
    perf_filter = ""
    if perf:
        perf_filter = " AND perf.score IS NOT NULL"
        if perf == "high":
            perf_filter += " AND perf.score >= 80"
        elif perf == "mid":
            perf_filter += " AND perf.score >= 50 AND perf.score < 80"
        else:
            perf_filter += " AND perf.score < 50"

    base_params = {
        "b": business_id,
        "q": q,
        "like_q": like_q,
        "category": category,
        "status": status,
    }
    params = dict(base_params, limit=page_size, offset=(page - 1) * page_size)

    joins = (
        " FROM inventory.products p"
        " JOIN mercadolibre.product_listings ml ON ml.product_id = p.id"
        " LEFT JOIN mercadolibre.performance perf ON perf.product_listing_id = ml.id"
        " LEFT JOIN mercadolibre.selling_costs sc ON sc.product_listing_id = ml.id"
        " LEFT JOIN mercadolibre.price_suggestions ps"
        "   ON ps.item_id = ml.meli_id AND ps.account_id = ml.account_id"
    )

    rows = get_all(
        "SELECT p.id, p.internal_code, p.sku, p.name, p.name_edited, p.category,"
        " p.stock, p.cost, p.price, p.updated_at,"
        " p.brand, p.model,"
        " " + IMAGE_SUBQUERY_SQL
        + ", ml.meli_id AS external_id, ml.account_id, ml.price AS listing_price, ml.permalink,"
        + " ml.status AS db_status, ml.reason,"
        + " ml.catalog_product_id, ml.marketplace_item_id, ml.marketplace_status,"
        + " ml.created_at AS listing_created_at, ml.updated_at AS listing_updated_at,"
        + " ml.price_manually_changed,"
        + " perf.score AS perf_score, perf.level_wording AS perf_level,"
        + " sc.total_selling_cost_with_tax AS selling_cost,"
        + " sc.total_selling_cost, sc.percentage_fee, sc.ship_list_cost,"
        + " ps.suggested_price, ps.current_price AS suggested_current_price,"
        + " ps.status AS suggested_status,"
        + " COUNT(*) OVER() AS total"
        + joins + filters + perf_filter
        + " ORDER BY p.updated_at DESC, p.id DESC LIMIT :limit OFFSET :offset",
        params)

    items = []
    for row in rows:
        items.append({
            "id": row["id"],
            "internal_code": row.get("internal_code"),
            "sku": row.get("sku"),
            "name": row.get("name"),
            "name_edited": row.get("name_edited"),
            "category": row.get("category"),
            "stock": int(row.get("stock") or 0),
            "cost": _serializable(row.get("cost") or 0),
            "price": _serializable(row.get("price") or 0),
            "image_url": row.get("image_url"),
            "updated_at": _serializable(row.get("updated_at")),
            "external_id": row.get("external_id"),
            "account_id": row.get("account_id"),
            "listing_price": _serializable(row.get("listing_price")),
            "permalink": row.get("permalink"),
            "status": ml_status_from_db(row.get("db_status"), row.get("reason")),
            "reason": row.get("reason"),
            "catalog_listing": bool(row.get("catalog_product_id")),
            "catalog_product_id": row.get("catalog_product_id"),
            "marketplace_item_id": row.get("marketplace_item_id"),
            "marketplace_status": row.get("marketplace_status"),
            "perf_score": row.get("perf_score"),
            "perf_level": row.get("perf_level"),
            "selling_cost": _serializable(row.get("selling_cost")),
            "brand": row.get("brand"),
            "model": row.get("model"),
            "listing_created_at": _serializable(row.get("listing_created_at")),
            "listing_updated_at": _serializable(row.get("listing_updated_at")),
            "price_manually_changed": bool(row.get("price_manually_changed")),
            "total_selling_cost": _serializable(row.get("total_selling_cost")),
            "percentage_fee": _serializable(row.get("percentage_fee")),
            "ship_list_cost": _serializable(row.get("ship_list_cost")),
            "suggested_price": _serializable(row.get("suggested_price")),
            "suggested_current_price": _serializable(row.get("suggested_current_price")),
            "suggested_status": row.get("suggested_status"),
        })

    # El total viaja en la MISMA query con COUNT(*) OVER() (una sola ida a la
    # DB, mismo patrón que list_products). Página fuera de rango -> 0.
    total = int(rows[0]["total"] or 0) if rows else 0

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": _pages_for(total, page_size),
    }


ML_EXPORT_COLUMNS = [
    {"key": "prod", "label": "Producto"},
    {"key": "pub", "label": "Publicación"},
    {"key": "price", "label": "Precio"},
    {"key": "tipo", "label": "Tipo"},
    {"key": "status", "label": "Estado"},
    {"key": "perf", "label": "Performance"},
    {"key": "cost", "label": "Costo de venta"},
    {"key": "category", "label": "Categoría"},
    {"key": "stock", "label": "Stock"},
    {"key": "upd", "label": "Actualizado"},
    {"key": "brand", "label": "Marca"},
    {"key": "model", "label": "Modelo"},
    {"key": "manual_price", "label": "Precio manual"},
    {"key": "reason", "label": "Motivo Meli"},
    {"key": "fee", "label": "Comisión ML"},
    {"key": "cost_no_tax", "label": "Costo sin IVA"},
    {"key": "ship_cost", "label": "Costo de envío"},
    {"key": "suggested", "label": "Precio sugerido"},
]


def _export_limit():
    try:
        limit = int(request.args.get("limit") or 1000)
    except ValueError:
        limit = 1000
    return max(0, limit)


@channels_bp.route("/mercadolibre/listings/export.csv", methods=["GET"])
@require_auth
def ml_listings_export():
    """CSV de publicaciones ML: mismas búsqueda/filtros que la vista."""
    q = (request.args.get("q") or "").strip()
    status = (request.args.get("status") or "").strip()
    perf = (request.args.get("perf") or "").strip()
    category = (request.args.get("category") or "").strip()
    limit = _export_limit()

    requested = (request.args.get("columns") or "").split(",")
    columns = [c for c in ML_EXPORT_COLUMNS if c["key"] in requested]
    if not columns:
        return jsonify({"error": "bad_request",
                        "message": "Elegí al menos una columna para exportar"}), 400

    like_q = "%" + q + "%"
    filters = (
        " WHERE p.business_id = :b"
        " AND (" + ML_LISTED_STATUS_SQL + ")"
        " AND (:q = '' OR p.name LIKE :like_q OR p.internal_code LIKE :like_q OR p.sku LIKE :like_q)"
        " AND (:category = '' OR p.category = :category)"
        " AND (:status = ''"
        "   OR (:status = 'published' AND ml.status IN ('active','Active','Updated.'))"
        "   OR (:status = 'paused' AND ml.status IN ('paused','Paused.'))"
        "   OR (:status = 'prepublished' AND ml.status LIKE 'Procesando%')"
        "   OR (:status = 'under_review' AND ml.status LIKE 'under_review%'))"
    )
    perf_filter = ""
    if perf:
        perf_filter = " AND perf.score IS NOT NULL"
        if perf == "high":
            perf_filter += " AND perf.score >= 80"
        elif perf == "mid":
            perf_filter += " AND perf.score >= 50 AND perf.score < 80"
        else:
            perf_filter += " AND perf.score < 50"

    base_params = {
        "b": current_business_id(),
        "q": q,
        "like_q": like_q,
        "category": category,
        "status": status,
    }
    sql = (
        "SELECT p.id, p.name, p.name_edited, p.category, p.stock, p.price,"
        " p.updated_at, p.brand, p.model,"
        " ml.meli_id AS external_id, ml.price AS listing_price,"
        " ml.status AS db_status, ml.reason, ml.catalog_product_id,"
        " ml.price_manually_changed, ml.updated_at AS listing_updated_at,"
        " perf.score AS perf_score,"
        " sc.total_selling_cost_with_tax AS selling_cost,"
        " sc.total_selling_cost, sc.percentage_fee, sc.ship_list_cost,"
        " ps.suggested_price"
        " FROM inventory.products p"
        " JOIN mercadolibre.product_listings ml ON ml.product_id = p.id"
        " LEFT JOIN mercadolibre.performance perf ON perf.product_listing_id = ml.id"
        " LEFT JOIN mercadolibre.selling_costs sc ON sc.product_listing_id = ml.id"
        " LEFT JOIN mercadolibre.price_suggestions ps"
        "   ON ps.item_id = ml.meli_id AND ps.account_id = ml.account_id"
        + filters + perf_filter
        + " ORDER BY p.updated_at DESC, p.id DESC"
    )
    params = dict(base_params)
    if limit > 0:
        sql += " LIMIT :limit"
        params["limit"] = limit

    # UNA sola query con cursor server-side: filas en batches de 1000 que se
    # escriben al CSV a medida que llegan (memoria acotada, sin paginar con
    # LIMIT/OFFSET). El `limit` sigue vivo como LIMIT dentro de la query.
    def _batches():
        for batch in stream_rows(sql, params):
            out = []
            for r in batch:
                out.append({
                    "prod": r.get("name_edited") or r.get("name") or "",
                    "pub": r.get("external_id") or "",
                    "price": r.get("listing_price") if r.get("listing_price") is not None
                             else (r.get("price") or 0),
                    "tipo": "Catálogo" if r.get("catalog_product_id") else "Tradicional",
                    "status": _STATUS_LABELS.get(
                        ml_status_from_db(r.get("db_status"), r.get("reason")),
                        ml_status_from_db(r.get("db_status"), r.get("reason"))),
                    "perf": r.get("perf_score") if r.get("perf_score") is not None else "",
                    "cost": r.get("selling_cost") if r.get("selling_cost") is not None else "",
                    "category": r.get("category") or "",
                    "stock": r.get("stock") or 0,
                    "upd": r.get("listing_updated_at") or r.get("updated_at") or "",
                    "brand": r.get("brand") or "",
                    "model": r.get("model") or "",
                    "manual_price": "Manual" if r.get("price_manually_changed") else "Auto",
                    "reason": r.get("reason") or "",
                    "fee": (str(r["percentage_fee"]) + " %")
                           if r.get("percentage_fee") is not None else "",
                    "cost_no_tax": r.get("total_selling_cost")
                                   if r.get("total_selling_cost") is not None else "",
                    "ship_cost": r.get("ship_list_cost")
                                 if r.get("ship_list_cost") is not None else "",
                    "suggested": r.get("suggested_price")
                                 if r.get("suggested_price") is not None else "",
                })
            yield out

    stamp = datetime.now().strftime("%Y%m%d")
    return stream_csv_response(columns, _batches(), "publicaciones-ml-%s.csv" % stamp)


@channels_bp.route("/tiendanube/listings", methods=["GET"])
@require_auth
def tn_listings():
    """Publicaciones de Tienda Nube del business (tabla de la vista TN)."""
    q = (request.args.get("q") or "").strip()
    status = (request.args.get("status") or "").strip()
    category = (request.args.get("category") or "").strip()
    try:
        page, page_size = _page_args()
    except LookupError as exc:
        return jsonify({"error": "bad_request", "message": str(exc)}), 400

    business_id = current_business_id()

    # Vista TN: cache de la página entera (filas + resumen + total) por
    # (filtros, página). El único escritor es el dashboard (ya invalida),
    # así que el TTL es solo red de seguridad.
    payload = cache.get_or_compute(
        business_id, "tn_listings", TTL_TN_ROWS,
        lambda: _tn_listings_payload(
            business_id, q, status, category, page, page_size),
        q, status, category, page, page_size)
    return jsonify(payload)


def _tn_listings_payload(business_id, q, status, category, page, page_size):
    """Página completa de la vista TN (cacheable, sin request context)."""
    like_q = "%" + q + "%"
    filters = (
        " WHERE p.business_id = :b"
        " AND (" + TN_LISTED_STATUS_SQL + ")"
        " AND (:q = '' OR p.name LIKE :like_q OR p.internal_code LIKE :like_q OR p.sku LIKE :like_q)"
        " AND (:category = '' OR p.category = :category)"
        " AND (:status = ''"
        "   OR (:status = 'published' AND tn.status IN ('Published','Updated.','published','active'))"
        "   OR (:status = 'paused' AND tn.status IN ('paused','Paused.'))"
        "   OR (:status = 'prepublished' AND tn.status LIKE 'Procesando%'))"
    )
    base_params = {
        "b": business_id,
        "q": q,
        "like_q": like_q,
        "category": category,
        "status": status,
    }
    params = dict(base_params, limit=page_size, offset=(page - 1) * page_size)

    joins = (
        " FROM inventory.products p"
        " JOIN tiendanube.product_listings tn ON tn.product_id = p.id"
    )

    rows = get_all(
        "SELECT p.id, p.internal_code, p.sku, p.name, p.name_edited, p.category,"
        " p.stock, p.cost, p.price, p.updated_at,"
        " " + IMAGE_SUBQUERY_SQL
        + ", tn.tnube_id AS external_id, tn.account_id, tn.price AS listing_price, tn.permalink,"
        + " tn.status AS db_status, tn.reason,"
        + " tn.updated_at AS listing_updated_at"
        + joins + filters
        + " ORDER BY p.updated_at DESC, p.id DESC LIMIT :limit OFFSET :offset",
        params)

    summary = get_one(
        "SELECT COUNT(*) AS listed,"
        " SUM(CASE WHEN tn.status IN ('Published','Updated.','published','active') THEN 1 ELSE 0 END) AS published,"
        " SUM(CASE WHEN tn.status IN ('paused','Paused.') THEN 1 ELSE 0 END) AS paused"
        + joins + " WHERE p.business_id = :b AND (" + TN_LISTED_STATUS_SQL + ")",
        {"b": business_id})

    items = []
    for row in rows:
        items.append({
            "id": row["id"],
            "internal_code": row.get("internal_code"),
            "sku": row.get("sku"),
            "name": row.get("name"),
            "name_edited": row.get("name_edited"),
            "category": row.get("category"),
            "stock": int(row.get("stock") or 0),
            "cost": _serializable(row.get("cost") or 0),
            "price": _serializable(row.get("price") or 0),
            "image_url": row.get("image_url"),
            "updated_at": _serializable(row.get("updated_at")),
            "external_id": row.get("external_id"),
            "account_id": row.get("account_id"),
            "listing_price": _serializable(row.get("listing_price")),
            "permalink": row.get("permalink"),
            "status": tn_status_from_db(row.get("db_status"), row.get("reason")),
            "listing_updated_at": _serializable(row.get("listing_updated_at")),
        })

    total = int(get_one(
        "SELECT COUNT(*) AS total" + joins + filters, base_params)["total"] or 0)

    return {
        "items": items,
        "summary": {
            "listed": int(summary["listed"] or 0),
            "published": int(summary["published"] or 0),
            "paused": int(summary["paused"] or 0),
            "avg_perf": None,
        },
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": _pages_for(total, page_size),
    }


TN_EXPORT_COLUMNS = [
    {"key": "prod", "label": "Producto"},
    {"key": "pub", "label": "Publicación"},
    {"key": "price", "label": "Precio"},
    {"key": "status", "label": "Estado"},
    {"key": "cat", "label": "Categoría"},
    {"key": "stock", "label": "Stock"},
    {"key": "upd", "label": "Actualizado"},
]


@channels_bp.route("/tiendanube/listings/export.csv", methods=["GET"])
@require_auth
def tn_listings_export():
    """CSV de publicaciones TN: mismas búsqueda/filtros que la vista."""
    q = (request.args.get("q") or "").strip()
    status = (request.args.get("status") or "").strip()
    category = (request.args.get("category") or "").strip()
    limit = _export_limit()

    requested = (request.args.get("columns") or "").split(",")
    columns = [c for c in TN_EXPORT_COLUMNS if c["key"] in requested]
    if not columns:
        return jsonify({"error": "bad_request",
                        "message": "Elegí al menos una columna para exportar"}), 400

    like_q = "%" + q + "%"
    filters = (
        " WHERE p.business_id = :b"
        " AND (" + TN_LISTED_STATUS_SQL + ")"
        " AND (:q = '' OR p.name LIKE :like_q OR p.internal_code LIKE :like_q OR p.sku LIKE :like_q)"
        " AND (:category = '' OR p.category = :category)"
        " AND (:status = ''"
        "   OR (:status = 'published' AND tn.status IN ('Published','Updated.','published','active'))"
        "   OR (:status = 'paused' AND tn.status IN ('paused','Paused.'))"
        "   OR (:status = 'prepublished' AND tn.status LIKE 'Procesando%'))"
    )
    base_params = {
        "b": current_business_id(),
        "q": q,
        "like_q": like_q,
        "category": category,
        "status": status,
    }
    sql = (
        "SELECT p.id, p.name, p.name_edited, p.category, p.stock, p.price,"
        " p.updated_at,"
        " tn.tnube_id AS external_id, tn.price AS listing_price,"
        " tn.status AS db_status, tn.reason, tn.updated_at AS listing_updated_at"
        " FROM inventory.products p"
        " JOIN tiendanube.product_listings tn ON tn.product_id = p.id"
        + filters
        + " ORDER BY p.updated_at DESC, p.id DESC"
    )
    params = dict(base_params)
    if limit > 0:
        sql += " LIMIT :limit"
        params["limit"] = limit

    rows = get_all(sql, params)
    out = []
    for r in rows:
        out.append({
            "prod": r.get("name_edited") or r.get("name") or "",
            "pub": ("#" + str(r["external_id"])) if r.get("external_id") else "",
            "price": r.get("listing_price") if r.get("listing_price") is not None
                     else (r.get("price") or 0),
            "status": _STATUS_LABELS.get(
                tn_status_from_db(r.get("db_status"), r.get("reason")),
                tn_status_from_db(r.get("db_status"), r.get("reason"))),
            "cat": r.get("category") or "",
            "stock": r.get("stock") or 0,
            "upd": r.get("listing_updated_at") or r.get("updated_at") or "",
        })

    stamp = datetime.now().strftime("%Y%m%d")
    return csv_response(columns, out, "publicaciones-tn-%s.csv" % stamp)


# ─── Envíos de MercadoLibre (mercadolibre.shipments) ───────────────────────────

SHIPMENTS_TABLE = "mercadolibre.shipments"


def _shipment_receiver(payload):
    addr = payload.get("receiver_address") or {}
    if not isinstance(addr, dict):
        return {"city": "", "state": "", "zip_code": ""}

    def _name(value):
        if isinstance(value, dict):
            return value.get("name") or ""
        return str(value or "")

    return {
        "city": _name(addr.get("city")),
        "state": _name(addr.get("state")),
        "zip_code": str(addr.get("zip_code") or ""),
    }


def _shipment_items(payload):
    items = payload.get("items") or payload.get("shipping_items") or []
    if not isinstance(items, list):
        return []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        out.append({
            "id": str(it.get("id") or ""),
            "title": str(it.get("title") or it.get("description") or ""),
            "quantity": int(it.get("quantity") or 1),
        })
    return out


def _shipment_payload(raw):
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw) or {}
        except (TypeError, ValueError):
            return {}
    return {}


# Filtros del listado de envíos (valores de Meli). `logistic_type` vive dentro
# del JSON `data` (no es columna), por eso el WHERE lo extrae con JSON_EXTRACT.
SHIPMENT_STATUS_FILTERS = (
    "pending", "handling", "ready_to_ship", "shipped",
    "delivered", "not_delivered", "cancelled",
)
SHIPMENT_LOGISTIC_FILTERS = ("cross_docking", "drop_off", "fulfillment", "self_service")


@channels_bp.route("/mercadolibre/shipments", methods=["GET"])
@require_auth
def ml_shipments():
    """Lista los envíos del business (proyección mercadolibre.shipments) con
    paginación, búsqueda y filtros server-side.

    Query: q (búsqueda por envío/orden/contenido del JSON), status
    (pending|handling|ready_to_ship|shipped|delivered|not_delivered|cancelled),
    logistic_type (cross_docking|drop_off|fulfillment|self_service — filtrar
    por cross_docking incluye también xd_drop_off), page (1-based), page_size
    (default 50, máx 200). Responde {items, total, page, page_size,
    counts{total,to_prepare,in_transit,delivered,incidents}}:
    - `total` = con filtros aplicados (para paginar).
    - `counts` = con la búsqueda pero SIN los filtros de estado/tipo
      (el strip de métricas respeta la búsqueda, no los filtros).
    """
    accounts = get_all(
        "SELECT id FROM " + ACCOUNTS_TABLE
        + " WHERE business_id = :b AND platform = 'mercadolibre'",
        {"b": current_business_id()})
    if not accounts:
        return jsonify({"items": [], "total": 0, "page": 1, "page_size": 50,
                        "counts": {"total": 0, "to_prepare": 0, "in_transit": 0,
                                   "delivered": 0, "incidents": 0}})

    q = (request.args.get("q") or "").strip()
    status_arg = (request.args.get("status") or "").strip()
    logistic_arg = (request.args.get("logistic_type") or "").strip()
    try:
        page = max(1, int(request.args.get("page") or 1))
    except ValueError:
        page = 1
    try:
        page_size = min(200, max(1, int(request.args.get("page_size") or 50)))
    except ValueError:
        page_size = 50

    ids = [a["id"] for a in accounts]
    placeholders = ",".join(":id%d" % i for i in range(len(ids)))
    base_params = {"id%d" % i: ids[i] for i in range(len(ids))}
    base_where = " WHERE account_id IN (" + placeholders + ")"
    if q:
        like_q = "%" + q + "%"
        base_where += (" AND (external_id LIKE :like_q OR order_id LIKE :like_q"
                       " OR CAST(data AS CHAR) LIKE :like_q)")
        base_params["like_q"] = like_q

    # Filtros: afectan la lista y el `total`, NO las métricas `counts`.
    filter_params = dict(base_params)
    filtered_where = base_where
    if status_arg in SHIPMENT_STATUS_FILTERS:
        filtered_where += " AND status = :status"
        filter_params["status"] = status_arg
    if logistic_arg in SHIPMENT_LOGISTIC_FILTERS:
        if logistic_arg == "cross_docking":
            # xd_drop_off es la variante de cross docking: se agrupa con él.
            filtered_where += (
                " AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.logistic_type'))"
                " IN ('cross_docking', 'xd_drop_off')")
        else:
            filtered_where += (
                " AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.logistic_type'))"
                " = :logistic_type")
            filter_params["logistic_type"] = logistic_arg

    total_row = get_one(
        "SELECT COUNT(*) AS n FROM " + SHIPMENTS_TABLE + filtered_where,
        filter_params)
    total = int(total_row["n"])

    counts = get_one(
        "SELECT"
        " COUNT(*) AS total,"
        " SUM(CASE WHEN status IN ('pending','handling') THEN 1 ELSE 0 END) AS to_prepare,"
        " SUM(CASE WHEN status IN ('ready_to_ship','shipped') THEN 1 ELSE 0 END) AS in_transit,"
        " SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,"
        " SUM(CASE WHEN status IN ('not_delivered','cancelled') THEN 1 ELSE 0 END) AS incidents"
        + " FROM " + SHIPMENTS_TABLE + base_where, base_params)

    rows = get_all(
        "SELECT external_id, order_id, status, data, updated_at"
        + " FROM " + SHIPMENTS_TABLE + filtered_where
        + " ORDER BY updated_at DESC, id DESC LIMIT :limit OFFSET :offset",
        dict(filter_params, limit=page_size, offset=(page - 1) * page_size))

    items = []
    for r in rows:
        payload = _shipment_payload(r.get("data"))
        items.append({
            "external_id": str(r["external_id"]),
            "order_id": str(r["order_id"]) if r.get("order_id") is not None else None,
            "status": r.get("status"),
            "substatus": payload.get("substatus"),
            "tracking_number": payload.get("tracking_number"),
            "logistic_type": payload.get("logistic_type") or "",
            "mode": payload.get("shipping_mode") or payload.get("mode") or "",
            "receiver": _shipment_receiver(payload),
            "items": _shipment_items(payload),
            "last_updated": _serializable(r.get("updated_at")),
        })
    return jsonify({
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "counts": {k: int(v or 0) for k, v in counts.items()},
    })


@channels_bp.route("/mercadolibre/shipments/<external_id>/label", methods=["GET"])
@require_auth
def ml_shipment_label(external_id):
    """Descarga la etiqueta (PDF) de un envío — proxy on-demand a Meli.

    200 = PDF binario (attachment etiqueta-{id}.pdf). Errores = JSON
    {error, message} legible (Meli controla la disponibilidad por estado:
    ready_to_ship/shipped sí; delivered y Full no).
    """
    try:
        row = get_one(
            "SELECT s.account_id FROM " + SHIPMENTS_TABLE + " s"
            " JOIN " + ACCOUNTS_TABLE + " a ON a.id = s.account_id"
            " WHERE s.external_id = :e AND a.business_id = :b",
            {"e": str(external_id), "b": current_business_id()})
    except LookupError:
        return jsonify({"error": "not_found",
                        "message": "Envío no encontrado"}), 404

    token = _account_token(row["account_id"])
    if not token:
        return _bad("La cuenta no tiene credenciales de MercadoLibre")

    from app.integrations.mercadolibre.shipment_labels import (
        LabelUnavailable, fetch_shipment_label_pdf)
    try:
        pdf = fetch_shipment_label_pdf(token, str(external_id), retries=1)
    except LabelUnavailable as exc:
        return jsonify({"error": "label_unavailable", "message": str(exc)}), 400

    response = make_response(pdf)
    response.headers["Content-Type"] = "application/pdf"
    response.headers["Content-Disposition"] = (
        'attachment; filename="etiqueta-{}.pdf"'.format(external_id))
    return response


# ─── Fotos de la publicación ML (meli_pictures -> bucket GCS) ──────────────────

MAX_ML_PICTURES = 10
MAX_PICTURE_BYTES = 10 * 1024 * 1024  # 10 MB
ML_IMAGES_TABLE = "inventory.product_images"
ML_PICTURES_BUCKET = "pictures_ecommerce_guiaslocales"


@channels_bp.route("/mercadolibre/pictures", methods=["POST"])
@require_auth
def ml_pictures():
    """Descarga las fotos de la publicación (mejoradas con IA por ML) a GCS.

    GET del item (reintenta 429/5xx) + subida a GCS + fila en
    inventory.product_images. Dedup en capas:
      (1) lock por producto (GET_LOCK) — evita requests simultáneos;
      (2) hash MD5 del contenido contra lo ya guardado en GCS — no
          re-descarga la misma foto aunque el nombre cambie;
      (3) nombres sin colisión ({product_id}_{n}.jpg);
      (4) UNIQUE (product_id, url) en la base.
    """
    data = request.get_json(silent=True) or {}
    try:
        product_id = int(data.get("product_id"))
        account_id = int(data.get("account_id"))
    except (TypeError, ValueError):
        return _bad("product_id y account_id son obligatorios")
    if _owned_product(product_id) is None:
        return jsonify({"error": "not_found", "message": "Producto no encontrado"}), 404
    if _owned_account(account_id, "mercadolibre") is None:
        return jsonify({"error": "not_found",
                        "message": "Cuenta de MercadoLibre no encontrada"}), 404

    token = _account_token(account_id)
    if not token:
        return jsonify({"error": "missing_token",
                        "message": "La cuenta no tiene access token de MercadoLibre"}), 400

    try:
        listing = get_one(
            "SELECT meli_id FROM " + ML_LISTINGS_TABLE + " WHERE product_id = :p",
            {"p": product_id})
    except LookupError:
        listing = None
    meli_id = listing.get("meli_id") if listing else None
    if not meli_id:
        return jsonify({"error": "not_published",
                        "message": "La publicación no tiene item de MercadoLibre"}), 400

    # Lock por producto: la descarga toca GCS y la tabla; dos requests
    # simultáneos leerían el mismo estado y duplicarían filas/archivos.
    lock_name = "ml-pictures-" + str(account_id) + "-" + str(product_id)
    conn = engine.connect().execution_options(isolation_level="AUTOCOMMIT")
    try:
        acquired = conn.execute(
            text("SELECT GET_LOCK(:name, :timeout)"),
            {"name": lock_name, "timeout": 30}).scalar()
        if acquired != 1:
            return jsonify({
                "error": "busy",
                "message": "Ya hay una descarga de fotos en curso para este producto."}), 409
        try:
            try:
                resp = _meli_request("GET", MELI_BASE_URL + "/items/" + str(meli_id),
                                     token, timeout=30)
                resp.raise_for_status()
                item = resp.json() or {}
            except Exception as exc:
                logger.exception("Could not fetch Meli item %s pictures", meli_id)
                return jsonify({"error": "meli_error",
                                "message": "No se pudieron obtener las fotos: %s" % str(exc)}), 502

            pictures = item.get("pictures") or []
            if not isinstance(pictures, list) or not pictures:
                return jsonify({"error": "no_pictures",
                                "message": "La publicación no tiene fotos para descargar"}), 400

            existing = get_all(
                "SELECT url FROM " + ML_IMAGES_TABLE + " WHERE product_id = :p",
                {"p": product_id})
            existing_urls = {r["url"] for r in existing}
            used = set()
            for url in existing_urls:
                filename = (url or "").rsplit("/", 1)[-1]
                if "_" in filename:
                    used.add(filename)

            # Dedup por contenido: md5 de los objetos ya guardados en GCS.
            try:
                from google.cloud import storage  # deferred: heavy import
                bucket = storage.Client().bucket(ML_PICTURES_BUCKET)
                existing_hashes = {
                    blob.md5_hash
                    for blob in bucket.list_blobs(prefix=str(product_id) + "/")
                    if blob.md5_hash
                }
            except Exception as exc:
                logger.exception("GCS list failed for product %s", product_id)
                return jsonify({"error": "storage_unavailable",
                                "message": "No se pudo leer el bucket de fotos: %s" % str(exc)}), 502

            saved = []
            failed = 0
            number = 1
            for pic in pictures:
                if not isinstance(pic, dict):
                    continue
                url = pic.get("url")
                if not url:
                    continue
                if len(existing_urls) + len(saved) >= MAX_ML_PICTURES:
                    break
                raw = None
                # El CDN de Meli suele fallar con timeouts transitorios.
                for attempt in range(2):
                    try:
                        img = requests.get(url, timeout=30)
                        img.raise_for_status()
                        raw = img.content
                        break
                    except Exception:
                        if attempt == 0:
                            time.sleep(1)
                if raw is None:
                    logger.warning("Could not download ML picture %s", url)
                    failed += 1
                    continue
                if len(raw) > MAX_PICTURE_BYTES:
                    continue
                digest = base64.b64encode(hashlib.md5(raw).digest()).decode()
                if digest in existing_hashes:
                    # Misma foto ya guardada (quizá con otro nombre): no duplicar.
                    continue

                while "{}_{}.jpg".format(product_id, number) in used:
                    number += 1
                used.add("{}_{}.jpg".format(product_id, number))
                blob_path = "{}/{}_{}.jpg".format(product_id, product_id, number)
                try:
                    blob = bucket.blob(blob_path)
                    blob.upload_from_string(raw, content_type="image/jpeg")
                except Exception as exc:
                    logger.exception("GCS upload failed for product %s picture", product_id)
                    message = str(exc)
                    if "storage.objects.create" in message or "403" in message:
                        message = (
                            "La service account de GCP no tiene permisos de escritura sobre "
                            "el bucket " + ML_PICTURES_BUCKET
                        )
                    return jsonify({"error": "storage_unavailable",
                                    "message": "No se pudo guardar la foto: %s" % message}), 502

                # UNIQUE (product_id, url): si la fila ya existe (defensa extra
                # contra carreras), se reutiliza en vez de duplicar.
                image_id = insert_and_get_id(
                    "INSERT INTO " + ML_IMAGES_TABLE
                    + " (product_id, url) VALUES (:p, :url)"
                    + " ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)",
                    {"p": product_id, "url": blob.public_url})
                existing_hashes.add(digest)
                saved.append({"id": image_id, "url": blob.public_url})
                existing_urls.add(blob.public_url)

            if not saved:
                if failed:
                    return jsonify({"error": "download_failed", "failed": failed,
                                    "message": "No se pudieron descargar %d foto(s) de MercadoLibre. Reintentá." % failed}), 502
                return jsonify({"error": "no_new_pictures",
                                "message": "No hay fotos nuevas para descargar"}), 400
            logger.info("Saved %d ML pictures for product %s", len(saved), product_id)
            cache.invalidate_business(current_business_id())  # post-escritura (ver cache.py)
            return jsonify({"saved": len(saved), "failed": failed, "images": saved}), 201
        finally:
            conn.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": lock_name})
    finally:
        conn.close()
