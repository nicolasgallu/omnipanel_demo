"""Guía de talles de MercadoLibre (size grid) para el flujo del dashboard.

Las categorías de indumentaria/calzado exigen, al publicar un item con SIZE,
los atributos SIZE_GRID_ID (id de la guía) y SIZE_GRID_ROW_ID (fila de la
talla). Este módulo resuelve (reusa o crea) la guía de forma DOMAIN-DRIVEN:
el template del dominio (`technical_specs?section=grids`) define:

- main_attribute: primer atributo con tag `main_attribute_candidate`
  (ropa: SIZE; calzado: MANUFACTURER_SIZE).
- equivalencias (FILTRABLE_SIZE): solo si el template las trae (ropa sí,
  calzado no). Sin equivalencias, el talle se usa tal cual.
- medidas de fila: atributos `required` sin `grid_filter`, que no sean el
  atributo principal ni FILTRABLE_SIZE, de UN solo tipo de medida (el primero
  que aparezca: BODY_MEASURE o CLOTHING_MEASURE; si no hay tipo, todas).

Validado contra la API real de Meli (02/10) en: vestidos, zapatillas,
pantalones, camisas, calzas, shorts, pijamas, camperas, buzos y remeras.
El nombre del chart NO puede tener "_" y el máximo son 60 caracteres.
"""
import json

import requests

from app.db.helpers import execute, get_one
from app.integrations.core.credentials import get_access_token
from app.settings.config import SCHEMA_MERCADOLIBRE
from app.utils.logger import logger

SITE_ID = "MLA"
MELI_BASE_URL = "https://api.mercadolibre.com"
GRIDS_TABLE = SCHEMA_MERCADOLIBRE + ".size_grids"
ATTRIBUTES_TABLE = SCHEMA_MERCADOLIBRE + ".attributes"
MEASURE_TYPES = ("BODY_MEASURE", "CLOTHING_MEASURE", "MIXED_MEASURE")
MAX_NAME_LENGTH = 60


def _auth_headers(token):
    return {"Authorization": "Bearer " + token, "Content-Type": "application/json"}


def _iter_settings_items(settings):
    for group in settings:
        for items in group.values():
            if not isinstance(items, list):
                continue
            for item in items:
                if isinstance(item, dict):
                    yield item


def grid_required(settings):
    """True si los settings de la categoría traen SIZE_GRID_ID (Meli lo manda
    solo cuando la categoría exige guía de talles)."""
    return any(item.get("id") == "SIZE_GRID_ID" for item in _iter_settings_items(settings))


def settings_value(settings, attr_id):
    for item in _iter_settings_items(settings):
        if item.get("id") == attr_id:
            return item.get("user_input_value")
    return None


def _set_settings_value(settings, attr_id, value):
    for item in _iter_settings_items(settings):
        if item.get("id") == attr_id:
            item["user_input_value"] = value
            return


def _category_domain(category_id, token):
    """settings.catalog_domain de la categoría (ej. MLA-DRESSES)."""
    resp = requests.get(MELI_BASE_URL + "/categories/" + str(category_id),
                        headers={"Authorization": "Bearer " + token}, timeout=30)
    resp.raise_for_status()
    return (resp.json().get("settings") or {}).get("catalog_domain")


def _template_attributes(payload):
    """Aplana los atributos del template (groups -> components -> components)."""
    for group in (payload.get("input") or {}).get("groups") or []:
        for comp in group.get("components") or []:
            for sub in comp.get("components") or []:
                for attr in sub.get("attributes") or []:
                    yield attr


def _grid_spec(domain_id, gender, brand, token):
    """Spec del dominio para armar la guía. Devuelve:
    (main_attribute_id, equivalencias {name: id}, medidas [{id, name, unit}],
     gender_id)."""
    headers = _auth_headers(token)
    url = MELI_BASE_URL + "/domains/{}/technical_specs".format(domain_id)

    resp = requests.get(url, params={"section": "grids"}, headers=headers, timeout=30)
    resp.raise_for_status()
    gender_id = None
    for attr in _template_attributes(resp.json()):
        if attr.get("id") == "GENDER":
            for value in attr.get("values") or []:
                if value.get("name") == gender:
                    gender_id = value.get("id")
    if gender_id is None:
        raise ValueError(
            "El género '{}' no es válido para la guía de talles de esta categoría.".format(gender))

    body = {"attributes": [
        {"id": "GENDER", "name": "Género", "value_id": gender_id,
         "value_name": gender, "value_struct": None,
         "values": [{"id": gender_id, "name": gender, "struct": None}],
         "attribute_group_id": "OTHERS", "attribute_group_name": "Otros"},
        {"id": "BRAND", "name": "Marca", "value_id": None, "value_name": brand,
         "value_struct": None,
         "values": [{"id": None, "name": brand, "struct": None}],
         "attribute_group_id": "OTHERS", "attribute_group_name": "Otros"},
    ]}
    resp2 = requests.post(url, params={"section": "grids"}, headers=headers,
                          json=body, timeout=30)
    resp2.raise_for_status()

    main_attribute_id = None
    equivalences = {}
    candidates = []  # (id, name, unit, measure_type)
    for attr in _template_attributes(resp2.json()):
        tags = set(attr.get("tags") or [])
        attr_id = attr.get("id")
        if attr_id == "FILTRABLE_SIZE":
            equivalences = {
                v.get("name"): v.get("id") for v in attr.get("values") or []
            }
            continue
        if "main_attribute_candidate" in tags and main_attribute_id is None:
            main_attribute_id = attr_id
            continue
        if ("required" in tags and "grid_filter" not in tags
                and attr_id != "SIZE" and attr.get("value_type") == "number_unit"):
            mtype = next((t for t in MEASURE_TYPES if t in tags), None)
            candidates.append((attr_id, attr.get("name"),
                               attr.get("default_unit_id") or "cm", mtype))

    if main_attribute_id is None:
        main_attribute_id = "SIZE"

    # UN tipo de medida: el primero que aparezca; si ninguna tiene tipo, todas.
    chosen_type = next((m for _, _, _, m in candidates if m), None)
    measures = [
        {"id": cid, "name": name, "unit": unit}
        for cid, name, unit, mtype in candidates
        if mtype == chosen_type or (chosen_type is None and mtype is None)
    ]
    return main_attribute_id, equivalences, measures, gender_id


def _cached_grid(account_id, domain_id, brand, gender):
    try:
        row = get_one(
            "SELECT meli_grid_id FROM " + GRIDS_TABLE
            + " WHERE account_id = :a AND domain_id = :d AND brand = :b AND gender = :g",
            {"a": account_id, "d": domain_id, "b": brand, "g": gender})
        return row["meli_grid_id"]
    except LookupError:
        return None


def _save_cached_grid(account_id, domain_id, brand, gender, meli_grid_id):
    execute(
        "INSERT INTO " + GRIDS_TABLE
        + " (account_id, domain_id, brand, gender, meli_grid_id)"
        + " VALUES (:a, :d, :b, :g, :m)"
        + " ON DUPLICATE KEY UPDATE meli_grid_id = :m",
        {"a": account_id, "d": domain_id, "b": brand, "g": gender, "m": meli_grid_id})


def _find_row(meli_grid_id, size, token, main_attribute_id):
    """Id de la fila del chart cuya talla coincide (o None)."""
    resp = requests.get(MELI_BASE_URL + "/catalog/charts/" + str(meli_grid_id),
                        headers={"Authorization": "Bearer " + token}, timeout=30)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    for row in (resp.json().get("rows") or []):
        for attr in row.get("attributes") or []:
            if attr.get("id") != main_attribute_id:
                continue
            values = attr.get("values") or []
            if values and values[0].get("name") == size:
                return row.get("id")
    return None


def _measure_value(measure_id, settings, config):
    """Valor de la medida: primero del config.attributes del request (es lo
    que completó el usuario en el wizard), fallback a settings."""
    attributes = (config or {}).get("attributes") or {}
    value = attributes.get(measure_id)
    if value is None or not str(value).strip():
        value = settings_value(settings, measure_id)
    return (str(value).strip() if value is not None else "")


def _create_chart(account_id, settings, config, domain_id, brand, gender, size,
                  token):
    """Crea la guía con UNA fila (la talla del item) y devuelve (grid_id, row_id)."""
    main_attribute_id, equivalences, measures, gender_id = _grid_spec(
        domain_id, gender, brand, token)

    # El talle solo se valida contra equivalencias cuando el dominio las tiene.
    if equivalences and size not in equivalences:
        raise ValueError(
            "El talle '{}' no es válido para la guía de talles de esta categoría.".format(size))

    row_attrs = [{"id": main_attribute_id, "values": [{"name": size}]}]
    if equivalences:
        row_attrs.append({"id": "FILTRABLE_SIZE",
                          "values": [{"id": equivalences[size], "name": size}]})
    missing = []
    for measure in measures:
        value = _measure_value(measure["id"], settings, config)
        if not value:
            missing.append(measure["name"])
            continue
        name = value + (" " + measure["unit"] if measure["unit"] else "")
        row_attrs.append({"id": measure["id"], "values": [{"name": name}]})
    if missing:
        raise ValueError(
            "Completá las medidas de la guía de talles: " + " · ".join(missing) + ".")

    # El nombre del chart NO admite "_" y tiene máximo 60 caracteres.
    base_name = ("Omnipanel {} {}".format(brand, gender).replace("_", " "))[:MAX_NAME_LENGTH]
    headers = _auth_headers(token)
    body = {
        "names": {SITE_ID: base_name},
        "domain_id": domain_id.split("-")[-1],
        "site_id": SITE_ID,
        "main_attribute": {"attributes": [{"site_id": SITE_ID, "id": main_attribute_id}]},
        "attributes": [
            {"id": "GENDER", "values": [{"id": gender_id, "name": gender}]},
            {"id": "BRAND", "values": [{"name": brand}]},
        ],
        "rows": [{"attributes": row_attrs}],
    }
    # El nombre del chart es único por site: reintentar con sufijo si choca.
    for attempt in range(6):
        resp = requests.post(MELI_BASE_URL + "/catalog/charts", headers=headers,
                             json=body, timeout=30)
        if resp.status_code == 400 and "chart_name_unavailable" in resp.text:
            body["names"][SITE_ID] = (base_name + "-" + str(attempt + 1))[:MAX_NAME_LENGTH]
            continue
        if resp.status_code == 400:
            raise ValueError("No se pudo crear la guía de talles: " + _chart_error(resp))
        resp.raise_for_status()
        data = resp.json()
        meli_grid_id = str(data["id"])
        row_id = str((data.get("rows") or [{}])[0].get("id"))
        _save_cached_grid(account_id, domain_id, brand, gender, meli_grid_id)
        logger.info("size_grid=created grid=%s row=%s brand=%s gender=%s size=%s",
                    meli_grid_id, row_id, brand, gender, size)
        return meli_grid_id, row_id
    raise ValueError("No se pudo crear la guía de talles: nombre ya en uso.")


def _chart_error(resp):
    try:
        body = resp.json()
        errors = body.get("errors") or []
        first = (errors[0] or {}).get("message") if errors else body.get("message")
        return str(first)[:200]
    except Exception:
        return resp.text[:200]


def resolve_size_grid(item_data, config=None):
    """Resuelve (reusa o crea) la guía de talles y deja SIZE_GRID_ID +
    SIZE_GRID_ROW_ID escritos en settings. Devuelve None o el mensaje de
    error legible para 'Failed to Publish.'.

    Las medidas se leen de `config.attributes` (lo que completó el usuario en
    el wizard); fallback a settings para llamadas directas.
    """
    try:
        settings = json.loads(item_data.get("settings") or "[]")
    except (TypeError, ValueError):
        return None
    if not grid_required(settings):
        return None

    size = (settings_value(settings, "SIZE") or "").strip()
    if not size:
        return None  # lo bloquea _missing_required_attributes ("Talle")

    if (settings_value(settings, "SIZE_GRID_ID") or "").strip() \
            and (settings_value(settings, "SIZE_GRID_ROW_ID") or "").strip():
        return None  # ya resuelto

    gender = (settings_value(settings, "GENDER") or "").strip()
    if not gender:
        return "Completá el género antes de publicar (la categoría exige guía de talles)."

    account_id = item_data.get("account_id")
    brand = (item_data.get("brand") or "Genérico").strip()
    try:
        token = get_access_token(account_id).get("access_token")
        if not token:
            return "La cuenta no tiene access token de MercadoLibre."

        domain_id = _category_domain(item_data.get("category_id"), token)
        if not domain_id:
            return "No se pudo determinar el dominio de la categoría."

        main_attribute_id, _, _, _ = _grid_spec(domain_id, gender, brand, token)
        meli_grid_id = _cached_grid(account_id, domain_id, brand, gender)
        row_id = (_find_row(meli_grid_id, size, token, main_attribute_id)
                  if meli_grid_id else None)
        if not row_id:
            meli_grid_id, row_id = _create_chart(
                account_id, settings, config, domain_id, brand, gender, size, token)

        _set_settings_value(settings, "SIZE_GRID_ID", meli_grid_id)
        _set_settings_value(settings, "SIZE_GRID_ROW_ID", row_id)
        execute(
            "UPDATE " + ATTRIBUTES_TABLE + " SET settings = :s WHERE id = :id",
            {"s": json.dumps(settings, ensure_ascii=False),
             "id": item_data.get("attribute_id")})
        logger.info("size_grid=resolved grid=%s row=%s product=%s",
                    meli_grid_id, row_id, item_data.get("id"))
        return None
    except ValueError as exc:
        logger.warning("size_grid=blocked product=%s: %s", item_data.get("id"), exc)
        return str(exc)
    except requests.HTTPError:
        logger.exception("size_grid api error product=%s", item_data.get("id"))
        return "No se pudo crear la guía de talles (error de MercadoLibre). Reintentá."
    except Exception:
        logger.exception("size_grid unexpected error product=%s", item_data.get("id"))
        return "No se pudo crear la guía de talles. Reintentá."
