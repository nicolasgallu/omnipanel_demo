import json
import time
import requests
from app.utils.logger import logger
from app.integrations.core.credentials import get_access_token
from app.integrations.mercadolibre.size_grid import resolve_size_grid
from app.db.helpers import get_one, execute, get_all
from app.settings.config import (SCHEMA_INVENTORY, SCHEMA_MERCADOLIBRE)

PRODUCTS_TABLE= 'products'
ATTRIBUTES_TABLE= 'attributes'
PRODUCT_LISTING_TABLE= 'product_listings'
IMAGES_TABLE= 'product_images'
VARIANTS_TABLE= 'variation_listings'


def get_data_for_meli(product_id):
    sql = (
        "SELECT "
        + "a.id, "
        + "a.price, "
        + "a.internal_code, "
        + "a.sku, "
        + "a.gtin, "
        + "a.name, "
        + "a.name_edited, "
        + "a.stock, "
        + "a.cost, "
        + "a.description, "
        + "a.brand, "
        + "a.model, "
        + "a.dimensions, "
        + "a.drive_url, "
        + "b.id AS product_listing_id, "
        + "b.account_id, "
        + "b.meli_id, "
        + "b.price AS price_meli, "
        + "b.catalog_product_id, "
        + "b.marketplace_item_id, "
        + "b.marketplace_status, "
        + "c.id AS attribute_id, "
        + "c.category_id, "
        + "c.currency_id, "
        + "c.buying_mode, "
        + "c.condition_type, "
        + "c.settings "
        + "FROM " + SCHEMA_INVENTORY + "." + PRODUCTS_TABLE + " AS a "
        + "LEFT JOIN " + SCHEMA_MERCADOLIBRE + "." + PRODUCT_LISTING_TABLE + " AS b ON b.product_id = a.id "
        + "LEFT JOIN " + SCHEMA_MERCADOLIBRE + "." + ATTRIBUTES_TABLE + " AS c ON c.product_listing_id = b.id "
        + "WHERE a.id = :product_id "
    )
    row = get_one(sql, {"product_id": product_id,})
    return row


def get_product_images(product_id):
    sql = (
        "SELECT "
        + "url "
        + "FROM " + SCHEMA_INVENTORY + "." + IMAGES_TABLE + " " 
        + "WHERE product_id = :product_id "
    )
    try:
        return get_all(sql, {"product_id": product_id,})
    except LookupError:
        return []


def get_product_variants(product_listing_id):
    """Return the first variation of a listing, or {} when it has none."""
    sql = (
        "SELECT "
        + "id "
        + "FROM " + SCHEMA_MERCADOLIBRE + "." + VARIANTS_TABLE + " " 
        + "WHERE product_listing_id = :product_listing_id "
    )
    try:
        return get_one(sql, {"product_listing_id": product_listing_id,})
    except LookupError:
        return {}




def _update_record(id, data, table):
    fields = []
    params = {"id": id}
    for field, value in data.items():
        # None writes a real NULL (used to clear reason/remedy on success).
        fields.append(f"{field} = :{field}")
        params[field] = value
    if not fields:
        return
    
    sql = (
        "UPDATE " + SCHEMA_MERCADOLIBRE + "." + table
        + " SET " + ", ".join(fields)
        + " WHERE id = :id"
    )
    rowcount = execute(sql, params)
    logger.info("Rows Affected: ")
    logger.info(rowcount)


def _delete_record(id, table):
    logger.info(f"Deleting: {id}")
    sql = (
        "DELETE FROM " + SCHEMA_MERCADOLIBRE + "." + table
        + " WHERE id = :id"
    )
    rowcount = execute(sql, {'id': id})
    logger.info("Rows Affected: ")
    logger.info(rowcount)


RETRYABLE_METHODS = ("GET", "PUT")
RETRY_STATUSES = (429, 500, 502, 503, 504)


def _meli_request(method, url, token, json_body=None, params=None, timeout=15):
    """requests wrapper with a small retry/backoff for safe (idempotent) Meli calls.

    Only GET/PUT retry on 429/5xx; POST stays single-attempt because repeating
    a create could duplicate the resource.
    """
    headers = {"Authorization": "Bearer " + token}
    if json_body is not None:
        headers["Content-Type"] = "application/json"

    attempts = 2 + 1 if method in RETRYABLE_METHODS else 1
    for attempt in range(attempts):
        started = time.monotonic()
        response = requests.request(
            method, url, headers=headers, json=json_body, params=params, timeout=timeout
        )
        if attempt == attempts - 1 or response.status_code not in RETRY_STATUSES:
            # Fase 3: una línea por llamada HTTP a Meli (método, URL, status,
            # intento y duración) -> un publish "frizado" muestra acá qué
            # llamada se colgó.
            logger.info("meli_http %s %s -> %s (attempt=%d, %.0fms)",
                        method, url, response.status_code, attempt + 1,
                        (time.monotonic() - started) * 1000)
            return response
        delay = 2 ** attempt  # 1s, then 2s
        if response.status_code == 429:
            try:
                delay = min(int(response.headers.get("Retry-After", delay)), 10)
            except (TypeError, ValueError):
                pass
        logger.warning(
            "Meli %s %s returned %s; retrying in %ss",
            method, url, response.status_code, delay,
        )
        time.sleep(delay)
    return None




def _aux_product_format(item_data):
    """"""
    logger.info("Creating Product Schema for Mercadolibre.")

    public_images=[]
        
    if public_images == []:
        logger.info("Without images in Folder, using images from DB.")
        product_id = item_data['id']
        public_images = get_product_images(product_id)
        public_images = [{'source': image["url"]} for image in public_images[:5]]


    product_name = item_data["name_edited"] or item_data["name"]
    price = item_data["price_meli"] or item_data["price"]
    settings = json.loads(item_data['settings'] or '[]')

    value_added_tax_ids = {
        "0 %": "48405907",
        "10.5 %": "48405908",
        "21 %": "48405909",
        "27 %": "48405910",
    }
    import_duty_ids = {
        "0 %": "49553239",
        "1 %": "49553240",
        "2.5 %": "49553241",
        "4 %": "49553242",
        "5 %": "49553243",
        "8 %": "49553244",
        "9.5 %": "49553245",
        "10 %": "49553246",
        "14 %": "49553247",
        "15 %": "49553248",
        "18 %": "49553249",
        "19 %": "49553250",
        "20 %": "49553251",
        "23 %": "49553252",
        "25 %": "49553253",
        "26 %": "49553254",
        "70 %": "49553255"
    }
    
    item_format = {
        "family_name": product_name,
        "category_id": item_data['category_id'], 
        "price": str(price), 
        "currency_id": item_data['currency_id'] or 'ARS', 
        "available_quantity": item_data['stock'],
        "buying_mode": item_data['buying_mode'], 
        "condition": item_data['condition_type'],
        "pictures": public_images, 
        "attributes": [
            {"id": "BRAND", "value_name": item_data['brand']},
            {"id": "MODEL", "value_name": item_data['model']},
        ],
        "shipping": {},
        "sale_terms": []
    }

    # Publicación directa en catálogo: el producto estándar se elige en el
    # wizard (matching) y se guarda en product_listings.catalog_product_id
    # antes de publicar. La ficha la define Meli; el seller solo aporta
    # precio/stock/condiciones.
    if item_data.get('catalog_product_id'):
        item_format['catalog_product_id'] = item_data['catalog_product_id']
        item_format['catalog_listing'] = True

    if item_data['gtin'] is None:
        product_code = { "id": "SELLER_SKU", "value_name": item_data['sku']}   
        attr_gtin = { "id": "GTIN", "value_name": "N/A"}   
        gtin_reason = { "id": "EMPTY_GTIN_REASON", "value_id": "17055160"}   
        item_format['attributes'].append(product_code)
        item_format['attributes'].append(attr_gtin)
        item_format['attributes'].append(gtin_reason)

    else:
        product_code = { "id": "GTIN", "value_name": item_data['gtin']}   
        item_format['attributes'].append(product_code)

    for setting_dict in settings:
        for setting in setting_dict:
            if setting == 'attributes':
                for v in setting_dict[setting]:
                    # NUNCA mandar atributos vacíos: Meli los descarta
                    # ("dropped because its values is empty") y, si son
                    # required, rechaza la publicación.
                    val = v.get("user_input_value")
                    if val is None or str(val).strip() == "":
                        continue
                    if v["id"] == "VALUE_ADDED_TAX":
                        item_format["attributes"].append({
                            "id": "VALUE_ADDED_TAX",
                            "value_id": value_added_tax_ids.get(val),
                            "value_name": val,
                        })
                    elif v["id"] == "IMPORT_DUTY":
                        item_format["attributes"].append({
                            "id": "IMPORT_DUTY",
                            "value_id": import_duty_ids.get(val),
                            "value_name": val,
                        })
                    else:
                        item_format["attributes"].append({
                            "id": v["id"],
                            "value_name": val,
                        })

            if setting == 'sale_terms':
                for v in setting_dict[setting]:
                    val = v.get('user_input_value')
                    if val is None or str(val).strip() == "":
                        continue
                    item_format['sale_terms'].append({"id": v['id'], "value_name": val})

            elif setting == 'shipping':
                [item_format["shipping"].update({v["id"]: v["user_input_value"]}) for v in setting_dict[setting]]
            
            elif setting == 'listing':
                types = [v.get('user_input_value') for v in setting_dict[setting]]
                if types:
                    item_format['listing_type_id'] = types[0]

    return item_format


def _missing_required_attributes(item_data):
    """Atributos requeridos por la categoría que quedaron sin valor.

    Se usa ANTES de publicar: Meli rechaza el item si un atributo required
    viaja vacío (lo descarta y falta), pero su mensaje mezcla warnings con
    errores. Acá devolvemos los nombres legibles de lo que falta.

    En modo catálogo (catalog_product_id presente) solo exigen los
    `catalog_required` (ej. BACKPACK_TYPE): el resto lo aporta la ficha de
    Meli. En tradicional se exigen los `required`.
    """
    missing = []
    try:
        settings = json.loads(item_data.get('settings') or '[]')
    except Exception:
        return missing
    catalog = bool(item_data.get('catalog_product_id'))
    for group in settings:
        for item in group.get('attributes') or []:
            # Los ids de la guía de talles los resuelve size_grid.py (no son
            # campos del usuario): nunca cuentan como "requerido vacío".
            if item.get('id') in ("SIZE_GRID_ID", "SIZE_GRID_ROW_ID"):
                continue
            if catalog:
                if not item.get('catalog_required'):
                    continue
            else:
                # Filas viejas no traen la flag `required`: el builder solo
                # guardaba required, así que default True preserva ese contrato.
                if not item.get('required', True):
                    continue
            val = item.get('user_input_value')
            if val is None or str(val).strip() == '':
                missing.append(str(item.get('name') or item.get('id')))
    return missing



def _settings_builder(attribute_id, category_id, price, token):
    """Return all required attributes by the category."""

    logger.info("Running Settings Builder")
    HEADER = {"Authorization": f"Bearer {token}"}    
    INTERNAL_AVOID_REQMNT = ['BRAND', 'MODEL', 'GTIN', 'EMPTY_GTIN_REASON']

    default_settings = {
        "WARRANTY_TIME": "30 dias",
        "WARRANTY_TYPE": "Garantia del vendedor",
        "VALUE_ADDED_TAX": "21 %",
        "IMPORT_DUTY": "0 %",
        "UNITS_PER_PACK": "1",
        "VOLUME_CAPACITY": "1 mL",
        "MODE": "me2",
        "LOCAL_PICK_UP": "True",
        "FREE_SHIPPING": "False",
        "LISTING_TYPE": "gold_special",
        "LOGISTIC_TYPE": "drop_off",
    }

    settings_list = [{'attributes':[]}, {'shipping':[]}, {'sale_terms':[]}, {'listing':[]}]
    
    for idx ,setting_dict in enumerate(settings_list):

        for setting in setting_dict:
            logger.info(f"Building {setting}..")

            if setting == 'attributes':
                response = requests.get(f"https://api.mercadolibre.com/categories/{category_id}/{setting}", headers=HEADER, timeout=30)

                if response.status_code > 300:
                    logger.info("Category Not Valid.")
                    data = json.dumps(response.json(), ensure_ascii=False)
                    data = {'settings': data}
                    _update_record(attribute_id, data, ATTRIBUTES_TABLE)
                    return
                
                else:
                    response = response.json()

            elif setting == 'sale_terms':
                response = requests.get(f"https://api.mercadolibre.com/categories/{category_id}/{setting}", headers=HEADER, timeout=30).json()

            elif setting == 'shipping':
                url = f"https://api.mercadolibre.com/categories/{category_id}/shipping_preferences"
                response = requests.get(url, headers=HEADER, timeout=30).json()
                var1 = {
                    'id': 'MODE', 
                    'name': 'Metodo de Envio',
                    'values':[{'name':[log.get('mode') for log in response.get('logistics')]}],
                    'value_type': 'list',
                    'value_max_lenght': '255'
                }
                var2 = {
                    'id': 'LOCAL_PICK_UP', 
                    'name': 'Buscar en Local',
                    'values':[{'name':['True','False']}],
                    'value_type': 'list',
                    'value_max_lenght': '5'
                }
                var3 = {
                    'id': 'FREE_SHIPPING', 
                    'name': 'Envio Gratis',
                    'values':[{'name':['True','False']}],
                    'value_type': 'list',
                    'value_max_lenght': '5'
                }
                var4 = {
                    'id': 'LOGISTIC_TYPE', 
                    'name': 'Tipo de Logistica',
                    'values':[{'name':['fulfillment','cross_docking','self_service','drop_off','custom']}],
                    'value_type': 'list',
                    'value_max_lenght': '20'
                }
                response = [var1, var2, var3, var4]

            elif setting == 'listing':
                response = requests.get(f"https://api.mercadolibre.com/sites/MLA/listing_prices?price={price}&category_id={category_id}", headers=HEADER, timeout=30).json()
                listing_data = [{
                    "id": data.get('listing_type_id'),
                    "name": data.get('listing_type_name'),
                    "sale_fee_amount": data.get('sale_fee_amount'),
                    "sale_fee_details": data.get('sale_fee_details'),
                    "listing_fee_amount": data.get('listing_fee_amount'),
                    "listing_fee_details": data.get('listing_fee_details'),
                } for data in response]
                response = [{
                    'id': 'LISTING_TYPE', 
                    'name': 'Campaña de Cuotas',
                    'values':[{'name':listing_data}],
                    'value_type': 'list',
                    'value_max_lenght': '255'
                }]

            for i in response:
                id = i.get('id')
                bool_att_req = False
                bool_catalog_req = False
                if setting == 'attributes':
                    tags = i.get('tags') or {}
                    bool_att_req = tags.get('required') or tags.get('conditional_required')
                    # Meli pide catalog_required/defines_picture (ej. COLOR)
                    # para que el item califique al catálogo aunque no estén
                    # marcados required: se muestran como recomendados.
                    bool_catalog_req = tags.get('catalog_required') or tags.get('defines_picture')

                keep = ((bool_att_req or bool_catalog_req) and id not in INTERNAL_AVOID_REQMNT) \
                    or id in ["SIZE_GRID_ID", "SIZE_GRID_ROW_ID"] \
                    or (setting == 'sale_terms' and id in ['WARRANTY_TYPE', 'WARRANTY_TIME']) \
                    or setting in ('listing', 'shipping')
                if keep:
                    values = {
                        'id': id,
                        'name': i.get('name'),
                        'value_examples': [val.get('name') for val in i.get('values')] if i.get('values') else '',
                        'value_max_lenght': i.get('value_max_length', ''),
                        'value_type': i.get('value_type', ''),
                        'condition': 'Restricted Input' if i.get('value_type').lower() == 'list' else 'Free Input',
                        'required': bool(bool_att_req),
                        'catalog_required': bool(bool_catalog_req),
                        'user_input_value': default_settings.get(id, '')
                    }
                    settings_list[idx][setting] += [values]
                    logger.info(f"{setting}: {id} added to json.")

    data = json.dumps(settings_list, ensure_ascii=False)
    data = {'settings': data}
    _update_record(attribute_id, data, ATTRIBUTES_TABLE)


def publish(payload):
    """publish the item with a second try option"""

    product_id = payload.get('product_id')
    account_id = payload.get('account_id')
    token = get_access_token(account_id).get('access_token')

    logger.info("Running Publish Action on Mercadolibre")
    item_data = get_data_for_meli(product_id)

    logger.info("Step 1: Checking if product is already publish.")
    if item_data['meli_id']:
        logger.warning(f"""Item: {product_id} already exists in mercadolibre under this ID: {item_data['meli_id']}, nothing to do.""")
        return True
    
    logger.info("Step 2: Attempting to publish the product in mercadolibre.")
    product_listing_id = item_data['product_listing_id']

    # Validación previa: bloquear acá (mensaje claro) en vez de mandar el POST
    # y recibir el rechazo confuso de Meli mezclando warnings con errores.
    missing = _missing_required_attributes(item_data)
    if missing:
        logger.info("Publish blocked for %s: missing required attributes %s",
                    product_id, missing)
        _update_record(product_listing_id, {
            'status': 'Failed to Publish.',
            'reason': 'Completá los campos obligatorios de la categoría antes de publicar: '
                      + ' · '.join(missing) + '.',
            'remedy': 'None',
            'catalog_product_id': None,
        }, PRODUCT_LISTING_TABLE)
        return None

    # Guía de talles: las categorías de indumentaria exigen SIZE_GRID_ID +
    # SIZE_GRID_ROW_ID. Se resuelve (reusa o crea) ANTES de armar el payload.
    grid_error = resolve_size_grid(item_data, payload.get("config"))
    if grid_error:
        logger.info("Publish blocked for %s: %s", product_id, grid_error)
        _update_record(product_listing_id, {
            'status': 'Failed to Publish.',
            'reason': grid_error,
            'remedy': 'None',
        }, PRODUCT_LISTING_TABLE)
        return None

    # Re-leer con los ids de la guía ya escritos en settings y armar el payload
    # final (SIZE_GRID_ID / SIZE_GRID_ROW_ID viajan como atributos).
    item_data = get_data_for_meli(product_id)
    item_format = _aux_product_format(item_data)

    # Fase 2 (payload-of-record): qué se manda a Meli, visible en Cloud
    # Logging sin adivinar — modo catálogo/tradicional, ficha, GTIN,
    # categoría, tipo de publicación, fotos, precio y stock.
    logger.info(
        "Publish payload for product %s: mode=%s catalog_product_id=%s"
        " catalog_listing=%s gtin=%s category=%s listing_type=%s"
        " pictures=%d price=%s stock=%s",
        product_id,
        "catalog" if item_format.get("catalog_listing") else "traditional",
        item_format.get("catalog_product_id"),
        item_format.get("catalog_listing"),
        item_data.get("gtin"),
        item_format.get("category_id"),
        item_format.get("listing_type_id"),
        len(item_format.get("pictures") or []),
        item_format.get("price"),
        item_format.get("available_quantity"),
    )

    step_start = time.monotonic()
    response = requests.post("https://api.mercadolibre.com/items", 
                    json=item_format,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=30)
    logger.info("step=post_items status=%s duration=%.0fms",
                response.status_code, (time.monotonic() - step_start) * 1000)
    if response.status_code < 300:
        logger.info("Publishing Item Done Succesfully.")
        body_json = response.json() or {}
        meli_id = body_json.get('id')
        permalink = body_json.get('permalink')
        step_start = time.monotonic()
        _set_description(meli_id, item_data["description"], token)
        logger.info("step=set_description duration=%.0fms",
                    (time.monotonic() - step_start) * 1000)
        
        data = {
        'meli_id': meli_id, 
        'permalink': permalink, 
        'status': 'Procesando..', 
        'reason': None, 
        'remedy': None, 
        }
        # Catálogo: capturar el producto estándar REAL que Meli asignó
        # (cubre también auto-optin por GTIN) y limpiar la sombra (item nuevo).
        data['catalog_product_id'] = body_json.get('catalog_product_id')
        data['marketplace_item_id'] = None
        data['marketplace_status'] = None
        # El precio de la publicación es el precio con el que se publicó:
        # si la fila todavía no tiene precio, guardar el usado en este POST
        # (el de inventario en ese momento).
        if not item_data["price_meli"]:
            try:
                data["price"] = int(float(item_data["price"]))
            except (TypeError, ValueError):
                pass
        _update_record(product_listing_id, data, PRODUCT_LISTING_TABLE)
        return True
        
    else:
        logger.info("Failed to Publish.")
        # El JSON crudo va al log; en reason queda un mensaje legible
        # (invariante: reason/remedy espejan la realidad, legibles).
        logger.error("Meli publish rejected (raw): %s", response.text[:3000])
        data = {
        'status': 'Failed to Publish.', 
        'reason': _meli_error_message(response, "MercadoLibre rechazó la publicación"), 
        'remedy': 'None', 
        # Se limpia el catalog_product_id pre-cargado: si el usuario reintenta
        # como tradicional no debe arrastrar el intento de catálogo fallido.
        'catalog_product_id': None, 
        }
        _update_record(product_listing_id, data, PRODUCT_LISTING_TABLE)
    return None


def update(payload):
    """Update MercadoLibre item"""
    logger.info("Running Update Action on Mercadolibre")

    product_id = payload.get('product_id')
    account_id = payload.get('account_id')
    

    token = get_access_token(account_id).get('access_token')
    if not token:
        logger.error("No access token found")
        return

    item_data = get_data_for_meli(product_id)
    product_listing_id = item_data.get('product_listing_id')
    meli_id = item_data.get('meli_id')
    if not meli_id:
        logger.error(f"Item {product_id} is not published, nothing to update.")
        return

    # Skip if product has variations (not supported yet)
    if get_product_variants(product_listing_id).get('id'):
        logger.info("Product has variations, skipping update.")
        _update_record(product_listing_id, {'status': 'Failed to Update.', 'reason': 'Product has variations.', 'remedy': 'None'}, PRODUCT_LISTING_TABLE)
        return

    # Catálogo: la ficha la define Meli — el update se reduce a precio y stock
    # (nunca título/atributos/fotos, que pertenecen a la ficha estándar).
    if item_data.get('catalog_product_id'):
        _update_catalog_listing(token, meli_id, product_listing_id, item_data)
        return

    url = f"https://api.mercadolibre.com/items/{meli_id}"

    # Get current status and sold quantity
    status, sub_status, sold_quantity = _get_meli_item_status(url, token, meli_id)
    if status is None:
        _update_record(product_listing_id, {'status': 'Failed to Update.', 'reason': 'Could not retrieve item status', 'remedy': 'None'}, PRODUCT_LISTING_TABLE)
        return

    # If forbidden, delete and republish
    if status == 'under_review' and sub_status == 'forbidden':
        logger.info(f"Product {meli_id} in Forbidden status, deleting and republishing.")
        delete(payload)
        publish(payload)
        return

    # Build update payload
    item_format = _aux_product_format(item_data)
    listing_type_id = item_format.pop('listing_type_id', None)

    # Remove fields that cannot be updated directly
    for field in ['category_id', 'currency_id', 'condition', 'attributes', 'buying_mode', 'shipping']:
        item_format.pop(field, None)

    # Handle family name: can't update if sold > 0
    if sold_quantity and sold_quantity > 0:
        item_format.pop('family_name', None)
    else:
        if 'family_name' in item_format:
            _update_family_name(url, token, item_format['family_name'])
            item_format.pop('family_name')

    # Main update
    try:
        response = _meli_request("PUT", url, token, json_body=item_format, timeout=10)
        response.raise_for_status()
        logger.info("General Update Done.")

        # Update description
        if item_data.get('description'):
            _set_description(meli_id, item_data['description'], token, update=True)

        # Update listing type (if possible)
        if listing_type_id:
            _update_listing_type(url, token, listing_type_id)

        # Reactivate if paused
        if status == 'paused':
            _reactivate_item(url, token, meli_id, product_listing_id)

        # Update local status
        _update_record(product_listing_id, {'status': 'Updated.','reason': None, 'remedy': None}, PRODUCT_LISTING_TABLE)

    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        logger.error(f"Update failed: {error_msg}")
        _update_record(product_listing_id, {'status': 'Failed to Update.', 'reason': error_msg, 'remedy': 'None'}, PRODUCT_LISTING_TABLE)


def _update_catalog_listing(token, meli_id, product_listing_id, item_data):
    """Update mínimo para publicaciones de catálogo: precio y stock, más la
    reactivación cuando el item está pausado (mismo comportamiento que el
    update tradicional: "Reactivar" reutiliza esta acción).

    Reactivar levanta AMBOS items del par (catálogo + tradicional sombra):
    el status no se auto-sincroniza en Meli entre los dos, y sin esto la
    tradicional quedaría pausada vendiendo a medias."""
    url = f"https://api.mercadolibre.com/items/{meli_id}"
    body = {}
    price = item_data.get('price_meli') or item_data.get('price')
    if price:
        try:
            body['price'] = int(float(price))
        except (TypeError, ValueError):
            pass
    if item_data.get('stock') is not None:
        try:
            body['available_quantity'] = int(item_data['stock'])
        except (TypeError, ValueError):
            pass

    # Estado real (best-effort): si Meli lo tiene pausado, al final se reactiva.
    current_status = None
    try:
        status_resp = _meli_request("GET", url, token, timeout=10)
        if status_resp.status_code == 200:
            current_status = (status_resp.json() or {}).get("status")
    except Exception:
        logger.exception("Could not read catalog item status for %s", meli_id)

    # ¿La tradicional sombra quedó pausada? (ej. pausa previa asimétrica).
    # El update la levanta junto con el item de catálogo.
    shadow_paused = str(item_data.get('marketplace_status') or '').lower() \
        in ('paused', 'paused.')

    if not body and current_status != 'paused' and not shadow_paused:
        logger.info("Nothing to update for catalog item %s", meli_id)
        return

    try:
        if body:
            response = _meli_request("PUT", url, token, json_body=body, timeout=10)
            response.raise_for_status()
            logger.info("Catalog update done for %s", meli_id)
        if current_status == 'paused':
            # Mismo paso que el update tradicional: reactivar el item pausado.
            _reactivate_item(url, token, meli_id, product_listing_id)
            shadow_paused = True
        if shadow_paused:
            # El par se mueve junto: la tradicional también vuelve a activa.
            _reactivate_shadow(item_data, token, product_listing_id)
        # Estado local: el webhook/la sync post-acción lo ajustan al real.
        _update_record(product_listing_id,
                        {'status': 'Updated.', 'reason': None, 'remedy': None},
                        PRODUCT_LISTING_TABLE)
    except requests.exceptions.RequestException as e:
        logger.error("Catalog update failed: %s", e)
        _update_record(product_listing_id,
                        {'status': 'Failed to Update.', 'reason': str(e),
                         'remedy': 'None'}, PRODUCT_LISTING_TABLE)


# --- Helper functions extracted for clarity ---

def _get_meli_item_status(url, token, meli_id):
    try:
        response = _meli_request("GET", url, token, timeout=10)
        response.raise_for_status()
        data = response.json()
        return data.get('status'), next(iter(data.get('sub_status') or []), 'good'), data.get('sold_quantity', 0)
    except Exception as e:
        logger.error(f"Error getting status for {meli_id}: {e}")
        return None, None, 0

def _update_family_name(url, token, family_name):
    try:
        response = _meli_request("PUT", f"{url}/family_name", token, json_body={"family_name": family_name}, timeout=10)
        if response.status_code < 300:
            logger.info("Family Name updated.")
        else:
            logger.error(f"Failed to update family name: {response.text}")
    except Exception as e:
        logger.error(f"Error updating family name: {e}")

def _update_listing_type(url, token, listing_type_id):
    try:
        response = _meli_request("POST", f"{url}/listing_type", token, json_body={"id": listing_type_id}, timeout=10)
        if response.status_code < 300:
            logger.info("Listing Type updated.")
        else:
            # It's not critical, just log the error
            logger.warning(f"Could not update listing type: {response.text}")
    except Exception as e:
        logger.warning(f"Error updating listing type: {e}")

def _reactivate_item(url, token, meli_id, product_listing_id):
    try:
        response = _meli_request("PUT", url, token, json_body={"status": "active"}, timeout=10)
        if response.status_code < 300:
            logger.info(f"Item {meli_id} reactivated.")
        else:
            logger.error("Meli reactivate rejected (raw): %s", response.text[:3000])
            _update_record(product_listing_id, {
                'status': 'Failed to Reactivate.',
                'reason': _meli_error_message(response, "MercadoLibre rechazó la reactivación"),
                'remedy': 'None'}, PRODUCT_LISTING_TABLE)
    except Exception as e:
        logger.error(f"Error reactivating item: {e}")
 


def pause(payload):
    """Changes item status to paused in Mercado Libre"""

    product_id = payload.get('product_id')
    account_id = payload.get('account_id')
    token = get_access_token(account_id).get('access_token')

    logger.info("Running Pause Action on Mercadolibre")
    item_data = get_data_for_meli(product_id)
    meli_id = item_data['meli_id'] 
    product_listing_id = item_data['product_listing_id']

    if meli_id is None:
        logger.error(f"Product: {item_data['id']} is not published, nothing to update.")
        return

    logger.info(f"Attempting to pause product: {meli_id}")
    response = _meli_request("PUT", f"https://api.mercadolibre.com/items/{meli_id}",
                             token, json_body={"status": "paused"})
    
    if response.status_code == 200:
        logger.info(f"Product: {meli_id} successfully paused.")
        data = {
        'status': 'Paused.', 
        'reason': 'User Action.', 
        'remedy': 'None', 
        }
        _update_record(product_listing_id, data, PRODUCT_LISTING_TABLE)
        # Catálogo: pausar también la publicación tradicional sombra. El
        # status NO se auto-sincroniza en Meli — sin esto seguiría vendiendo.
        _pause_shadow(item_data, token, product_listing_id)

    else:
        logger.error("Meli pause rejected (raw): %s", response.text[:3000])
        data = {
        'status': 'Failed to Pause.', 
        'reason': _meli_error_message(response, "MercadoLibre rechazó la pausa"), 
        'remedy': 'None', 
        }
        _update_record(product_listing_id, data, PRODUCT_LISTING_TABLE)
    return


def _pause_shadow(item_data, token, product_listing_id=None):
    """Pausar la publicación tradicional sombra (best-effort, nunca rompe la acción)."""
    shadow = item_data.get('marketplace_item_id')
    if not shadow or shadow == item_data.get('meli_id'):
        return
    response = _meli_request("PUT", f"https://api.mercadolibre.com/items/{shadow}",
                             token, json_body={"status": "paused"})
    if response.status_code in (200, 404):
        logger.info("Shadow marketplace item %s paused.", shadow)
        if product_listing_id is not None:
            _update_record(product_listing_id, {'marketplace_status': 'paused'},
                           PRODUCT_LISTING_TABLE)
    else:
        logger.warning("Could not pause shadow marketplace item %s: %s",
                       shadow, response.text[:300])


def _reactivate_shadow(item_data, token, product_listing_id=None):
    """Reactivar la publicación tradicional sombra (best-effort, nunca rompe
    la acción). El par catálogo+tradicional se mueve junto: al reactivar, la
    tradicional también vuelve a activa (el status no se auto-sincroniza)."""
    shadow = item_data.get('marketplace_item_id')
    if not shadow or shadow == item_data.get('meli_id'):
        return
    response = _meli_request("PUT", f"https://api.mercadolibre.com/items/{shadow}",
                             token, json_body={"status": "active"})
    if response.status_code in (200, 404):
        logger.info("Shadow marketplace item %s reactivated.", shadow)
        if product_listing_id is not None:
            _update_record(product_listing_id, {'marketplace_status': 'active'},
                           PRODUCT_LISTING_TABLE)
    else:
        logger.warning("Could not reactivate shadow marketplace item %s: %s",
                       shadow, response.text[:300])


def _close_shadow(item_data, token):
    """Cerrar la publicación tradicional sombra (best-effort, nunca rompe la acción)."""
    shadow = item_data.get('marketplace_item_id')
    if not shadow or shadow == item_data.get('meli_id'):
        return
    response = _meli_request("PUT", f"https://api.mercadolibre.com/items/{shadow}",
                             token, json_body={"status": "closed"})
    if response.status_code in (200, 404):
        logger.info("Shadow marketplace item %s closed.", shadow)
    else:
        logger.warning("Could not close shadow marketplace item %s: %s",
                       shadow, response.text[:300])


def _meli_error_message(response, prefix):
    """Mensaje legible desde una respuesta de error de Meli.

    Separa los `cause[]` de tipo error (los que RECHAZAN la acción) de los
    warning (avisos que no bloquean): el usuario debe ver primero qué falló
    de verdad, y los avisos aparte, bien rotulados. El JSON crudo va al log.
    """
    try:
        body = response.json()
    except Exception:
        return "%s (HTTP %d)" % (prefix, response.status_code)
    if isinstance(body, list):
        body = body[0] if body and isinstance(body, dict) else {}
    errors = []
    warnings = []
    if isinstance(body, dict):
        for cause in body.get("cause") or []:
            if isinstance(cause, dict) and cause.get("message"):
                if str(cause.get("type", "")).lower() == "warning":
                    warnings.append(str(cause["message"]))
                else:
                    errors.append(str(cause["message"]))
        if not errors and not warnings and body.get("message"):
            errors.append(str(body["message"]))

    def _uniq(messages):
        seen = set()
        uniq = []
        for m in messages:
            if m not in seen:
                seen.add(m)
                uniq.append(m)
        return uniq

    errors = _uniq(errors)
    warnings = _uniq(warnings)
    if not errors and not warnings:
        try:
            errors.append(json.dumps(body, ensure_ascii=False)[:300])
        except Exception:
            pass
    message = prefix + ": " + " · ".join(errors)
    if warnings:
        message += " · Avisos de Meli (no bloquean): " + " · ".join(warnings)
    return message


def _meli_not_modifiable(response):
    """Meli 400 cuando el item ya está cerrado/inactivo (`item.status.not_modifiable`).

    No es un fallo real del delete: el item ya no está activo públicamente,
    así que el flujo puede seguir hacia el marcado de eliminación.
    """
    try:
        body = response.json()
    except Exception:
        return False
    if not isinstance(body, dict):
        return False
    for cause in body.get("cause") or []:
        if isinstance(cause, dict) and cause.get("code") == "item.status.not_modifiable":
            return True
    return False


def delete(payload):
    """Close + mark deleted in Meli, then remove the local listing row.

    Tolerante a los estados de moderación de Meli: si el item ya está
    closed/inactive (o Meli rechaza la transición con
    `item.status.not_modifiable`), se considera "ya cerrado" y se sigue con
    el marcado de eliminación en vez de quedarse en 'Failed to Delete.'.
    """

    product_id = payload.get('product_id')
    account_id = payload.get('account_id')
    token = get_access_token(account_id).get('access_token')
    if not token:
        logger.error("No access token found for account %s", account_id)
        return

    logger.info("Running Delete Action on Mercadolibre")
    item_data = get_data_for_meli(product_id)
    meli_id = item_data['meli_id']
    product_listing_id = item_data['product_listing_id']

    if meli_id is None:
        logger.error(f"Product: {product_id} is not published, nothing to delete.")
        return

    url = f"https://api.mercadolibre.com/items/{meli_id}"

    def _fail(response):
        logger.error("Meli delete rejected (raw): %s", response.text[:3000])
        data = {'status': 'Failed to Delete.',
                'reason': _meli_error_message(response, "MercadoLibre rechazó la eliminación"),
                'remedy': 'None'}
        _update_record(product_listing_id, data, PRODUCT_LISTING_TABLE)

    # 1) Estado actual: 404 = ya no existe → solo queda limpiar la fila local.
    response = _meli_request("GET", url, token, timeout=10)
    if response.status_code == 404:
        logger.info("Item %s no longer exists in Meli; removing local row", meli_id)
        _delete_record(product_listing_id, PRODUCT_LISTING_TABLE)
        return

    item_status = None
    sub_status = None
    if response.status_code == 200:
        body = response.json() or {}
        item_status = body.get("status")
        sub_status = body.get("sub_status") or []

    already_closed = item_status in ("closed", "inactive") or (
        isinstance(sub_status, list) and "deleted" in sub_status)

    # 2) Cerrar (saltar si Meli ya lo tiene cerrado/inactivo).
    if not already_closed:
        response = _meli_request("PUT", url, token, json_body={"status": "closed"})
        if response.status_code not in (200, 404):
            if not _meli_not_modifiable(response):
                _fail(response)
                return
            logger.info("Item %s already closed per Meli (not_modifiable); continuing", meli_id)

    # 2b) Catálogo: cerrar también la publicación tradicional sombra
    #     (best-effort; el status no se auto-sincroniza en Meli).
    _close_shadow(item_data, token)

    # 3) Marcar eliminado (Meli conserva el registro, flag deleted).
    response = _meli_request("PUT", url, token, json_body={"deleted": "true"})
    if response.status_code not in (200, 404):
        if not _meli_not_modifiable(response):
            _fail(response)
            return
        logger.info("Item %s already deleted per Meli (not_modifiable)", meli_id)

    _delete_record(product_listing_id, PRODUCT_LISTING_TABLE)
    return

    
def _set_description(meli_id, description, token, update=False):
    """Load Description to Mercadolibre"""
    logger.info("Checking if description exists.")
    if description:
        logger.info(f"Loading Description for product: {meli_id}")
        url = f"https://api.mercadolibre.com/items/{meli_id}/description"
        payload = {"plain_text": description}
        if update == True:
            response = _meli_request("PUT", url, token, json_body=payload)
        else:
            response = _meli_request("POST", url, token, json_body=payload)
        if response.status_code <300:
            logger.info(f"Description loaded for product: {meli_id}")
        else:
            logger.error(f"Failed to load description for product {meli_id}: {response.status_code} - {response.text}")
    else:
        logger.info("Description dont exists, nothing to do.")

