"""Eligibilidad local (solo estado en DB) para acciones masivas.

Una acción está "ready" para un producto si:
  (a) el producto es ELEGIBLE (reglas locales por plataforma/acción), y
  (b) la acción CAMBIARÍA su estado.

Reglas acordadas con el usuario (Figma v184):
  publish  ML/TN: sin publicar, pre-publicada o fallida (+ readiness: ML
           precio+fotos+settings completos; TN precio).
  update   ML/TN: publicada o pausada.
  pause    ML: publicada (TN no tiene pausa).
  delete   ML/TN: publicada, pausada o pre-publicada.
  link     ML: publicada o pausada, no está en catálogo (y tiene GTIN: el
           vínculo masivo resuelve la ficha por GTIN).
  unlink   ML: publicada o pausada, está en catálogo y tiene sombra
           tradicional a la que volver (las que nacieron en catálogo no).

La MISMA función que usa el contador del front (`eligibility_counts`) es la
que usa el snapshot del job (`eligible_product_ids`): el número que se ve es
el número que corre. Nunca se llama a la API de las plataformas acá — solo
estado local.

Fuente de "settings completos" para publish de ML: `_missing_required_attributes`
de product_handler — la misma validación que usa el publish individual.
"""
import json

from app.db.helpers import get_all, get_one
from app.settings.config import (
    SCHEMA_ACCOUNTS,
    SCHEMA_INVENTORY,
    SCHEMA_MERCADOLIBRE,
    SCHEMA_TIENDANUBE,
)

ACTIONS = ("publish", "update", "pause", "delete", "link", "unlink")
PLATFORMS = ("mercadolibre", "tiendanube")

ML_LISTINGS_TABLE = SCHEMA_MERCADOLIBRE + ".product_listings"
ML_ATTRIBUTES_TABLE = SCHEMA_MERCADOLIBRE + ".attributes"
TN_LISTINGS_TABLE = SCHEMA_TIENDANUBE + ".product_listings"
PRODUCTS_TABLE = SCHEMA_INVENTORY + ".products"
IMAGES_TABLE = SCHEMA_INVENTORY + ".product_images"
ACCOUNTS_TABLE = SCHEMA_ACCOUNTS + ".accounts"

# Estados "publicada" / "pausada" por plataforma (mismos valores que escriben
# el webhook de items y las acciones individuales).
_ML_LIVE = ("active", "Active", "Updated.")
_ML_PAUSED = ("paused", "Paused.")
_TN_LIVE = ("Published", "Updated.", "published", "active")
_TN_PAUSED = ("paused", "Paused.")


def _is_failed_status(status):
    return status.startswith("Failed") or status.startswith("Error")


def _is_prepub(status):
    return status.startswith("Procesando")


# Tope defensivo: el front manda los ids seleccionados explícitamente.
MAX_ELIGIBILITY_IDS = 5000


class EligibilityError(ValueError):
    """Error de validación con mensaje legible para el usuario."""


def _in_clause(prefix, ids):
    """Fragmento SQL `(:p0, :p1, ...)` + dict de parámetros."""
    params = {}
    parts = []
    for i, pid in enumerate(ids):
        key = prefix + str(i)
        params[key] = pid
        parts.append(":" + key)
    return "(" + ", ".join(parts) + ")", params


def owned_account(business_id, account_id, platform=None):
    """Cuenta del negocio (y plataforma si se pide), o None."""
    sql = ("SELECT * FROM " + ACCOUNTS_TABLE
           + " WHERE id = :id AND business_id = :b")
    params = {"id": account_id, "b": business_id}
    if platform:
        sql += " AND platform = :platform"
        params["platform"] = platform
    try:
        return get_one(sql, params)
    except LookupError:
        return None


def business_account_id(business_id, platform):
    """Primera cuenta del negocio para la plataforma, o None."""
    try:
        return get_one(
            "SELECT id FROM " + ACCOUNTS_TABLE
            + " WHERE business_id = :b AND platform = :p"
            + " ORDER BY id ASC LIMIT 1",
            {"b": business_id, "p": platform})["id"]
    except LookupError:
        return None


def _owned_products(business_id, product_ids):
    """Valida ownership de TODOS los ids (invariante: nunca confiar en ids del
    front). Devuelve la lista dedupeada en orden de llegada."""
    ids = list(dict.fromkeys(int(p) for p in product_ids))
    if not ids:
        return []
    if len(ids) > MAX_ELIGIBILITY_IDS:
        raise EligibilityError(
            "Seleccioná menos de %d productos para calcular la acción" % MAX_ELIGIBILITY_IDS)
    found = 0
    for chunk in _chunks(ids, 500):
        clause, params = _in_clause("p", chunk)
        params["b"] = business_id
        row = get_one(
            "SELECT COUNT(*) AS n FROM " + PRODUCTS_TABLE
            + " WHERE business_id = :b AND id IN " + clause, params)
        found += row["n"]
    if found != len(ids):
        raise EligibilityError("Algunos productos seleccionados no pertenecen a tu negocio")
    return ids


def _chunks(ids, size):
    for i in range(0, len(ids), size):
        yield ids[i:i + size]


def _ml_rows(product_ids):
    out = {}
    for chunk in _chunks(product_ids, 500):
        clause, params = _in_clause("p", chunk)
        rows = get_all(
            "SELECT b.product_id, b.meli_id, b.status, b.catalog_product_id,"
            " b.marketplace_item_id, c.category_id, c.settings"
            " FROM " + ML_LISTINGS_TABLE + " b"
            " LEFT JOIN " + ML_ATTRIBUTES_TABLE + " c ON c.product_listing_id = b.id"
            " WHERE b.product_id IN " + clause, params)
        for r in rows:
            out[r["product_id"]] = r
    return out


def _tn_rows(product_ids):
    out = {}
    for chunk in _chunks(product_ids, 500):
        clause, params = _in_clause("p", chunk)
        rows = get_all(
            "SELECT product_id, tnube_id, status FROM " + TN_LISTINGS_TABLE
            + " WHERE product_id IN " + clause, params)
        for r in rows:
            out[r["product_id"]] = r
    return out


def _image_counts(product_ids):
    out = {}
    for chunk in _chunks(product_ids, 500):
        clause, params = _in_clause("p", chunk)
        rows = get_all(
            "SELECT product_id, COUNT(*) AS n FROM " + IMAGES_TABLE
            + " WHERE product_id IN " + clause + " GROUP BY product_id", params)
        for r in rows:
            out[r["product_id"]] = r["n"]
    return out


def _settings_complete(ml_row):
    """Categoría elegida + settings construidos + sin requeridos vacíos
    (la misma validación del publish individual)."""
    if not ml_row or not ml_row.get("category_id"):
        return False
    try:
        settings = json.loads(ml_row.get("settings") or "[]")
    except (TypeError, ValueError):
        return False
    if not isinstance(settings, list) or not settings:
        return False
    from app.integrations.mercadolibre.product_handler import (
        _missing_required_attributes,
    )
    return _missing_required_attributes(ml_row) == []


def _has_price(product_row):
    try:
        return float(product_row.get("price") or 0) > 0
    except (TypeError, ValueError):
        return False


def _item_eligible(platform, action, product_row, ml_row, tn_row, img_count):
    """Predicado ÚNICO de eligibilidad (contador del front y snapshot del job)."""
    price_ok = _has_price(product_row)
    if platform == "mercadolibre":
        ml = ml_row or {}
        meli_id = ml.get("meli_id")
        status = ml.get("status") or ""
        live = status in _ML_LIVE
        paused = status in _ML_PAUSED
        prepub = _is_prepub(status)
        failed = _is_failed_status(status)
        if action == "publish":
            # Sin publicar / pre-publicada / fallida + readiness (precio,
            # fotos y settings completos — lo que exige el publish de ML).
            return ((not meli_id) or prepub or failed) and price_ok \
                and img_count > 0 and _settings_complete(ml_row)
        if action == "update":
            return bool(meli_id) and (live or paused)
        if action == "pause":
            return bool(meli_id) and live
        if action == "delete":
            return bool(meli_id) and (live or paused or prepub)
        if action == "link":
            # El vínculo masivo resuelve la ficha por GTIN: sin GTIN no hay
            # forma segura de elegirla.
            return (bool(meli_id) and (live or paused)
                    and not ml.get("catalog_product_id")
                    and bool((product_row.get("gtin") or "").strip()))
        if action == "unlink":
            # Solo vuelve la que tiene sombra tradicional; la que nació en
            # catálogo no puede desvincularse (mismo criterio del botón).
            return (bool(meli_id) and (live or paused)
                    and bool(ml.get("catalog_product_id"))
                    and bool(ml.get("marketplace_item_id")))
        return False
    # tiendanube
    tn = tn_row or {}
    tnube_id = tn.get("tnube_id")
    status = tn.get("status") or ""
    live = status in _TN_LIVE
    paused = status in _TN_PAUSED
    prepub = _is_prepub(status)
    failed = _is_failed_status(status)
    if action == "publish":
        return ((not tnube_id) or prepub or failed) and price_ok
    if action == "update":
        return bool(tnube_id) and (live or paused)
    if action == "delete":
        return bool(tnube_id) and (live or paused or prepub)
    # pause / link / unlink no existen en Tienda Nube.
    return False


def _snapshot(business_id, product_ids):
    """Datos locales de la selección + validación de ownership."""
    ids = _owned_products(business_id, product_ids)
    products = {}
    for chunk in _chunks(ids, 500):
        clause, params = _in_clause("p", chunk)
        for r in get_all(
                "SELECT id, price, gtin FROM " + PRODUCTS_TABLE
                + " WHERE id IN " + clause, params):
            products[r["id"]] = r
    ml_rows = _ml_rows(ids)
    tn_rows = _tn_rows(ids)
    images = _image_counts(ids)
    return ids, products, ml_rows, tn_rows, images


def eligibility_counts(business_id, product_ids):
    """Contadores por acción y plataforma para la selección (el "cartel" del
    front). Claves internas: mercadolibre/tiendanube (la API las mapea a
    ml/tn). Sin cuenta conectada → 0 para esa plataforma."""
    ids, products, ml_rows, tn_rows, images = _snapshot(business_id, product_ids)
    counts = {a: {"mercadolibre": 0, "tiendanube": 0} for a in ACTIONS}
    for pid in ids:
        p = products[pid]
        ml = ml_rows.get(pid)
        tn = tn_rows.get(pid)
        img = images.get(pid, 0)
        for action in ACTIONS:
            if _item_eligible("mercadolibre", action, p, ml, tn, img):
                counts[action]["mercadolibre"] += 1
            if _item_eligible("tiendanube", action, p, ml, tn, img):
                counts[action]["tiendanube"] += 1
    return counts


def eligible_product_ids(business_id, platform, account_id, action, product_ids):
    """Ids elegibles para UN (platform, action) — el snapshot del job."""
    if platform not in PLATFORMS:
        raise EligibilityError("Plataforma inválida")
    if action not in ACTIONS:
        raise EligibilityError("Acción inválida")
    if owned_account(business_id, account_id, platform) is None:
        raise EligibilityError("La cuenta no pertenece a tu negocio")
    ids, products, ml_rows, tn_rows, images = _snapshot(business_id, product_ids)
    out = []
    for pid in ids:
        p = products[pid]
        if _item_eligible(platform, action, p, ml_rows.get(pid),
                          tn_rows.get(pid), images.get(pid, 0)):
            out.append(pid)
    return out
