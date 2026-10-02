import requests
import json
import time
from app.utils.logger import logger
from app.db.helpers import get_one, execute, get_all, insert_and_get_id
from app.settings.config import SCHEMA_INVENTORY, SCHEMA_TIENDANUBE, SCHEMA_ACCOUNTS
import hashlib
from sqlalchemy import text
from app.db.engine import engine

LOCK_TIMEOUT = 30

PRODUCT_LISTING_TABLE= 'product_listings'
ATTRIBUTES_TABLE='attributes'
PRODUCTS_TABLE='products'
CATEGORIES_TABLE='categories'
CREDS_TABLE= 'credentials'
ACCOUNTS_TABLE= 'accounts'
IMAGES_TABLE= 'product_images'

# Tienda Nube solo acepta enums en inglés para age_group/gender de la variant;
# el front muestra labels en español, así que acá se mapean.
TN_AGE_GROUP_MAP = {
    "Adultos": "adult",
    "Adolescentes": "adult",   # compat con valores viejos
    "Niños": "kids",
    "Bebés": "infant",
    "Recién nacido": "newborn",
}
TN_GENDER_MAP = {
    "Hombre": "male",
    "Mujer": "female",
    "Unisex": "unisex",
    "Infantil": "unisex",      # compat con valores viejos
}

# Labels canónicos expuestos al front (el dropdown los arma desde acá).
TN_GENDER_OPTIONS = ["Mujer", "Hombre", "Unisex"]
TN_AGE_GROUP_OPTIONS = ["Adultos", "Niños", "Bebés", "Recién nacido"]

# Alias viejos -> label canónico (para normalizar datos guardados al leerlos).
_TN_GENDER_CANONICAL = {"Infantil": "Unisex"}
_TN_AGE_CANONICAL = {"Adolescentes": "Adultos"}


def normalize_tn_gender(value):
    if value is None:
        return None
    return _TN_GENDER_CANONICAL.get(value, value)


def normalize_tn_age_group(value):
    if value is None:
        return None
    return _TN_AGE_CANONICAL.get(value, value)


def _tn_enum(value, mapping):
    """Label español (o ya en inglés) -> enum válido de Tienda Nube; None si
    está vacío o es el placeholder '—' (el campo se omite del payload)."""
    value = str(value or "").strip()
    if not value or value == "—":
        return None
    return mapping.get(value, value)


TN_RETRYABLE_METHODS = ("GET", "PUT", "DELETE")
TN_RETRY_STATUSES = (429, 500, 502, 503, 504)


def _tn_request(method, url, token, json_body=None, timeout=30):
    """requests wrapper con timeout y retry/backoff para llamadas TN
    idempotentes (espejo de _meli_request de MercadoLibre).

    GET/PUT/DELETE reintentan 429/5xx con backoff; POST va a un solo intento
    (repetir un create podría duplicar el recurso). TODAS las llamadas llevan
    timeout: sin él, una API colgada traba el worker por minutos.
    """
    headers = {"Authentication": "bearer " + token,
               "Content-Type": "application/json"}
    attempts = 3 if method in TN_RETRYABLE_METHODS else 1
    for attempt in range(attempts):
        started = time.monotonic()
        response = requests.request(
            method, url, headers=headers,
            data=json.dumps(json_body, default=str) if json_body is not None else None,
            timeout=timeout,
        )
        if attempt == attempts - 1 or response.status_code not in TN_RETRY_STATUSES:
            # Fase 3: una línea por llamada HTTP a Tienda Nube (método, URL,
            # status, intento y duración).
            logger.info("tn_http %s %s -> %s (attempt=%d, %.0fms)",
                        method, url, response.status_code, attempt + 1,
                        (time.monotonic() - started) * 1000)
            return response
        delay = 2 ** attempt  # 1s, luego 2s
        if response.status_code == 429:
            try:
                delay = min(int(response.headers.get("Retry-After", delay)), 10)
            except (TypeError, ValueError):
                pass
        logger.warning("TN %s %s returned %s; retrying in %ss",
                       method, url, response.status_code, delay)
        time.sleep(delay)
    return None


def _image_key_from_src(src):
    """Clave comparable de una URL de imagen: el nombre del archivo, sin
    extensión ni query. TN re-hospeda las fotos en su CDN pero conserva ese
    nombre como prefijo del src (verificado contra la tienda real)."""
    try:
        seg = str(src or "").split("/")[-1].split("?")[0]
        return seg.rsplit(".", 1)[0]
    except Exception:
        return ""


def _match_local_key(tn_key, local_keys):
    """La clave de TN queda '<nombre>-<hash>...': matchea la clave local más
    larga que sea prefijo exacto seguido de '-' (evita que 'foto-1' capture
    'foto-10'). Devuelve la clave local o None."""
    for key in sorted(local_keys, key=len, reverse=True):
        if tn_key == key or tn_key.startswith(key + "-"):
            return key
    return None


def _sync_tn_images(token, images_url, local_images):
    """Sincroniza las fotos de TN con las locales usando el nombre de archivo
    como identidad: solo borra lo que sobra y sube lo que falta (nunca borra
    y re-sube todo como antes).

    La fuente de verdad es el inventario local: las fotos que solo existen en
    TN (o que no matchean ningún archivo local) se eliminan. Nunca rompe el
    flujo: los errores de fotos se loguean y el update general ya aplicó.
    Devuelve (deleted, added).
    """
    if not local_images:
        return 0, 0
    response = _tn_request("GET", images_url, token, timeout=30)
    if response.status_code != 200:
        logger.warning("TN images sync: GET %s failed (%s): %s",
                       images_url, response.status_code, response.text[:200])
        return 0, 0
    current = response.json() or []

    # Las fotos locales vienen como {'src': url} (formato del payload TN).
    local_by_key = {}
    for img in local_images:
        src = img.get("url") or img.get("src")
        key = _image_key_from_src(src)
        if key:
            local_by_key.setdefault(key, src)

    deleted = 0
    kept_keys = set()
    # Agrupar las fotos TN que matchean por clave local: puede haber
    # DUPLICADOS (corridas viejas con deletes fallidos). Se conserva la de
    # menor position y las repetidas se borran.
    by_match = {}
    unmatched = []
    for im in current:
        im_id = im.get("id")
        tn_key = _image_key_from_src(im.get("src"))
        match = _match_local_key(tn_key, local_by_key.keys()) if tn_key else None
        if match is not None and match in local_by_key:
            by_match.setdefault(match, []).append((im.get("position") or 0, im_id))
        else:
            unmatched.append(im_id)

    for im_id in unmatched:
        # Sobra: solo existe en TN o ya no está en el inventario local.
        resp = _tn_request("DELETE", f"{images_url}/{im_id}", token, timeout=30)
        if resp.status_code in (200, 404):
            deleted += 1
        else:
            logger.warning("TN image delete %s failed (%s): %s",
                           im_id, resp.status_code, resp.text[:200])

    for key, ids in by_match.items():
        kept_keys.add(key)
        for _pos, im_id in sorted(ids)[1:]:
            resp = _tn_request("DELETE", f"{images_url}/{im_id}", token, timeout=30)
            if resp.status_code in (200, 404):
                deleted += 1
            else:
                logger.warning("TN image duplicate delete %s failed (%s): %s",
                               im_id, resp.status_code, resp.text[:200])

    added = 0
    for key, src in local_by_key.items():
        if key in kept_keys:
            continue
        resp = _tn_request("POST", images_url, token,
                           json_body={"src": src}, timeout=30)
        if resp.status_code in (200, 201):
            added += 1
            kept_keys.add(key)
        else:
            logger.warning("TN image upload %s failed (%s): %s",
                           src, resp.status_code, resp.text[:200])
    return deleted, added


def get_data_for_tnube(product_id):
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
        + "b.id AS product_listing_id, "
        + "b.tnube_id, "
        + "b.variant_id, "
        + "b.price AS price_tnube, "
        + "c.settings, "
        + "d.external_category_id "
        + "FROM " + SCHEMA_INVENTORY + "." + PRODUCTS_TABLE + " AS a "
        + "LEFT JOIN " + SCHEMA_TIENDANUBE + "." + PRODUCT_LISTING_TABLE + " AS b ON b.product_id = a.id "
        + "LEFT JOIN " + SCHEMA_TIENDANUBE + "." + ATTRIBUTES_TABLE + " AS c ON c.product_listing_id = b.id "
        + "LEFT JOIN " + SCHEMA_TIENDANUBE + "." + CATEGORIES_TABLE + " AS d ON d.id = c.category_id "
        + "WHERE a.id = :product_id "
    )
    row = get_one(sql, {"product_id": product_id,})
    return row


def get_nube_creds(account_id):
    sql = (
        "SELECT "
        + "a.external_account_id as user_id,"
        + "b.access_token "
        + "FROM " + SCHEMA_ACCOUNTS + "." + ACCOUNTS_TABLE + " AS a "
        + "JOIN " + SCHEMA_ACCOUNTS + "." + CREDS_TABLE + " AS b ON a.id = b.account_id "
        + "WHERE a.id = :account_id "
    )
    try:
        return get_one(sql, {"account_id": account_id,})
    except LookupError:
        return {}

def get_category(product_id):
    sql = (
        "SELECT "
        + "a.id, "
        + "a.category as official_category, "
        + "b.id  as product_listing_id, "
        + "c.id  as attrb_id, "
        + "d.id as category_id, "
        + "d.name as tiendanube_category "
        + "FROM " + SCHEMA_INVENTORY + "." + PRODUCTS_TABLE + " AS a "
        + "LEFT JOIN " + SCHEMA_TIENDANUBE + "." + PRODUCT_LISTING_TABLE + " AS b ON b.product_id = a.id "
        + "LEFT JOIN " + SCHEMA_TIENDANUBE + "." + ATTRIBUTES_TABLE + " AS c ON c.product_listing_id = b.id "
        + "LEFT JOIN " + SCHEMA_TIENDANUBE + "." + CATEGORIES_TABLE + " AS d ON TRIM(UPPER(d.name)) = TRIM(UPPER(a.category)) AND d.account_id = b.account_id "
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



def _insert_record(data, table):
    fields = []
    values = []
    params = {}

    for field, value in data.items():
        if value is not None:
            fields.append(field)
            values.append(f":{field}")
            params[field] = value

    if not fields:
        return None

    sql = (
        "INSERT INTO " + SCHEMA_TIENDANUBE + "." + table
        + " (" + ", ".join(fields) + ") "
        + "VALUES (" + ", ".join(values) + ")"
    )

    # Same connection for INSERT + id (result.lastrowid): a separate
    # SELECT LAST_INSERT_ID() could read another pooled connection's id.
    last_id = insert_and_get_id(sql, params)

    logger.info("Inserted ID: %s", last_id)
    return last_id



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
        "UPDATE " + SCHEMA_TIENDANUBE + "." + table
        + " SET " + ", ".join(fields)
        + " WHERE id = :id"
    )
    rowcount = execute(sql, params)
    logger.info("Rows Affected: ")
    logger.info(rowcount)



def _delete_record(id, table):
    logger.info(f"Deleting: {id}")
    sql = (
        "DELETE FROM " + SCHEMA_TIENDANUBE + "." + table
        + " WHERE id = :id"
    )
    rowcount = execute(sql, {'id': id})
    logger.info("Rows Affected: ")
    logger.info(rowcount)



def parse_dimensions(dimensions):
    """Normaliza "HxWxD,peso" (soporta decimales tipo "6.0") a
    {height, width, depth, weight_kg}. El peso de la DB viene en gramos."""
    if not dimensions:
        return {}
    parts = dimensions.split("x")
    if len(parts) < 3:
        return {}
    try:
        height = int(float(parts[0]))
        width = int(float(parts[1]))
        depth_weight = parts[2].split(",")
        depth = int(float(depth_weight[0]))
        weight = int(float(depth_weight[1]) / 1000) if len(depth_weight) > 1 else 0
    except (TypeError, ValueError):
        logger.warning("Could not parse dimensions: %s", dimensions)
        return {}
    return {"height": height, "width": width, "depth": depth, "weight": weight}


def aux_format_data(product_id):


    def _aux_dimensions(data):
        # Los valores pueden venir con decimales ("6.0"): int() directo
        # rompía con "invalid literal for int() with base 10: '6.0'".
        return parse_dimensions(data.get("dimensions", None))

    

    data = get_data_for_tnube(product_id)

    #public_images = process_images_storage(item_id) ###probar primero con mercaodlibre workflow.
    public_images=[]
    if public_images == []:
        logger.info("Without images in Folder, using images from DB.")
        product_id = data['id']
        public_images = get_product_images(product_id)
        public_images = [{'src': image["url"]} for image in public_images[:5]]

    else:
        for i in public_images:
            i['src'] = i['source']
            i.pop('source')

    product_listing_id =  data.get('product_listing_id')
    dimensions = _aux_dimensions(data)
    tnube_id = data.get("tnube_id")
    variant_id = data.get("variant_id")
    category_id = data["external_category_id"] or 39076803 #generic gategory.
    product_name = data["name_edited"] or data["name"]
    price = int(data["price_tnube"] or data["price"] or 0)
    cost = int(data["cost"] or 0)
    stock = data["stock"]
    sku = data["sku"]


    settings = json.loads(data.get("settings") or "{}")

    
    seo_title = (
        settings.get("SEO_TITLE", {}).get("USER_INPUT_VALUE")
        or settings.get("SEO_TITLE", {}).get("DEFAULT_VALUE")
    )
    seo_description = (
        settings.get("SEO_DESCRIPTION", {}).get("USER_INPUT_VALUE")
        or settings.get("SEO_DESCRIPTION", {}).get("DEFAULT_VALUE")
    )
    barcode = (
        settings.get("BARCODE", {}).get("USER_INPUT_VALUE")
        or settings.get("BARCODE", {}).get("DEFAULT_VALUE")
    ) 
    video_url = (
        settings.get("VIDEO_URL", {}).get("USER_INPUT_VALUE")
        or settings.get("VIDEO_URL", {}).get("DEFAULT_VALUE")
    )
    tags = (
        settings.get("TAGS", {}).get("USER_INPUT_VALUE")
        or settings.get("TAGS", {}).get("DEFAULT_VALUE")
    )
    promotional_price = (
        settings.get("PROMOTIONAL_PRICE", {}).get("USER_INPUT_VALUE")
        or settings.get("PROMOTIONAL_PRICE", {}).get("DEFAULT_VALUE")
    )
    mpn = (
        settings.get("MPN", {}).get("USER_INPUT_VALUE")
        or settings.get("MPN", {}).get("DEFAULT_VALUE")
    )
    age_group = _tn_enum(
        settings.get("AGE_GROUP", {}).get("USER_INPUT_VALUE")
        or settings.get("AGE_GROUP", {}).get("DEFAULT_VALUE"),
        TN_AGE_GROUP_MAP)
    gender = _tn_enum(
        settings.get("GENDER", {}).get("USER_INPUT_VALUE")
        or settings.get("GENDER", {}).get("DEFAULT_VALUE"),
        TN_GENDER_MAP)
    free_shipping = (
        settings.get("FREE_SHIPPING", {}).get("USER_INPUT_VALUE")
        or settings.get("FREE_SHIPPING", {}).get("DEFAULT_VALUE")
    )

    product_data = {
        "name": {"es": product_name},
        "description": {"es": data.get("description")},
        "seo_title": {"es": seo_title},
        "seo_description": {"es": seo_description},
        "free_shipping": free_shipping,
        "brand": data.get("brand"),
        "video_url": video_url,
        "images": public_images,
        "tags": tags,
        "categories": [category_id]
    }
    
    variant_data = [
        {
        "price": price,
        "promotional_price": promotional_price,
        "stock": stock,
        "sku": sku,
        "barcode": barcode,
        "weight": dimensions.get("weight", 0),
        "width": dimensions.get("width", 0),
        "height": dimensions.get("height", 0),
        "depth": dimensions.get("depth", 0),
        "cost": cost,
        "mpn": mpn,
        }
    ]
    # Opcionales: solo se mandan si hay un enum válido (evita el 400 de TN).
    if age_group:
        variant_data[0]["age_group"] = age_group
    if gender:
        variant_data[0]["gender"] = gender

    result = {
        'product_listing_id' : product_listing_id,
        'product_data': product_data, 
        'variant_data': variant_data, 
        'tnube_id': tnube_id, 
        'variant_id': variant_id
    }
    return result 




##==========================PUBLISH=================================##




def publish(payload):
    
    logger.info("publish process started")
    product_id = payload['product_id']

    result = aux_format_data(product_id)
    product_listing_id =  result.get('product_listing_id')
    product_data =  result.get('product_data')
    variant_data =  result.get('variant_data')
    tnube_id =  result.get('tnube_id')

    if tnube_id:
        logger.info("product already published, nothing to do.")
        return

    else:
        account_id = payload['account_id']
        creds = get_nube_creds(account_id)
        token = creds.get('access_token')
        user_id = creds.get('user_id')

        url_base = f"https://api.tiendanube.com/v1/{user_id}/products"

        product_data['variants'] = variant_data
        # TN NO acepta images inline en el POST de creación: las fotos se
        # suben aparte tras crear el producto (mismo diff que el update).
        images = product_data.pop('images', [])
        response = _tn_request("POST", url_base, token,
                               json_body=product_data, timeout=30)

        if response.status_code == 201:
            tnube_id = response.json()['id']
            if images:
                deleted, added = _sync_tn_images(
                    token, f"{url_base}/{tnube_id}/images", images)
                logger.info("TN images synced on publish: %d deleted, %d added",
                            deleted, added)
            response = _tn_request(
                "GET", url_base + "/" + str(tnube_id), token, timeout=30)
            product = response.json()
            data = {
                'tnube_id': response.json()['id'], 
                'variant_id':response.json()['variants'][0]['id'],
                'permalink': product["canonical_url"], 
                'status': 'Published', 
                'reason': None, 
                'remedy': None, 
            }
            _update_record(product_listing_id, data, PRODUCT_LISTING_TABLE)

        else:
            logger.error("product failed to be published!")
            error = json.dumps([response.json()], ensure_ascii=False)
            data = {
            'status': 'Failed to Publish.', 
            'reason': error, 
            'remedy': 'None', 
            }
            _update_record(product_listing_id, data, PRODUCT_LISTING_TABLE)

    return



##==========================UPDATE=================================##

def update(payload):
    
    logger.info("update process started")
    product_id = payload['product_id']

    result = aux_format_data(product_id)
    product_listing_id =  result.get('product_listing_id')
    product_data =  result.get('product_data')
    variant_data =  result.get('variant_data')
    tnube_id =  result.get('tnube_id')
    variant_id =  result.get('variant_id')


    if tnube_id is None:
        logger.info("product is not published, nothing to do.")
        return


    account_id = payload['account_id']
    creds = get_nube_creds(account_id)
    token = creds.get('access_token')
    user_id = creds.get('user_id')

    url_base = f"https://api.tiendanube.com/v1/{user_id}/products"

    images = product_data.pop('images', [])
    url_upd_product = f"{url_base}/{tnube_id}"
    url_upd_variant = f"{url_upd_product}/variants/{variant_id}"
    url_upd_image = f"{url_upd_product}/images"

    response = _tn_request("PUT", url_upd_product, token,
                           json_body=product_data, timeout=30)
    logger.info("Step 1: Upadting Product (general)")
    if response.status_code == 200:
        logger.info("Step 1: Done")
    else:
        logger.error("product failed to be updated!")
        error = json.dumps([response.json()], ensure_ascii=False)
        data = {
        'status': 'Failed to Update.', 
        'reason': error, 
        'remedy': 'None', 
        }
        _update_record(product_listing_id, data, PRODUCT_LISTING_TABLE)


        return

    logger.info("Step 2: Upadting Product (variant)")
    response = _tn_request("PUT", url_upd_variant, token,
                           json_body=variant_data[0], timeout=30)
    if response.status_code == 200:
        logger.info("Step 2: Done")
    else:
        logger.error("variant failed to be updated!")
        error = json.dumps([response.json()], ensure_ascii=False)
        data = {
        'status': 'Failed to Update.', 
        'reason': error, 
        'remedy': 'None', 
        }
        _update_record(product_listing_id, data, PRODUCT_LISTING_TABLE)
        return

    logger.info("Step 3: Upadting Product (images) — sync por filename")
    if images:
        deleted, added = _sync_tn_images(token, url_upd_image, images)
        logger.info("TN images synced: %d deleted, %d added", deleted, added)

    logger.info("Product correctly updated")
    data = {'status': 'Updated.', 'reason': None, 'remedy': None}
    _update_record(product_listing_id, data, PRODUCT_LISTING_TABLE)
    return



###==========================DELETE=================================##
def delete(payload):

    logger.info("delete process started")

    product_id = payload['product_id']

    result = aux_format_data(product_id)
    product_listing_id =  result.get('product_listing_id')
    tnube_id =  result.get('tnube_id')

    if tnube_id is None:
        logger.info("product is not published, nothing to do.")
        return

    account_id = payload['account_id']
    creds = get_nube_creds(account_id)
    token = creds.get('access_token')
    user_id = creds.get('user_id')

    url_base = f"https://api.tiendanube.com/v1/{user_id}/products"

    del_url = f"{url_base}/{tnube_id}"
    response = _tn_request("DELETE", del_url, token, timeout=30)
    if response.status_code == 200:
        logger.info("product correctly deleted!")
        _delete_record(product_listing_id, PRODUCT_LISTING_TABLE)

    else:
        logger.info("product failed to delete")
        error = json.dumps([response.json()], ensure_ascii=False)
        data = {
        'status': 'Failed to Delete.', 
        'reason': error, 
        'remedy': 'None', 
        }
        _update_record(product_listing_id, data, PRODUCT_LISTING_TABLE)
    return




def create_categories(payload):

    logger.info("Creating Category process started")

    product_id = payload['product_id']
    account_id = payload['account_id']
    category_info = get_category(product_id)
    attrb_id = category_info.get('attrb_id')
    category_name = category_info.get('official_category')

    # One lock per account+category: two tenants with the same category name never block each other.
    lock_name = "tnube-category-" + str(account_id) + "-" + hashlib.md5(
        category_name.strip().upper().encode()).hexdigest()

    conn = engine.connect().execution_options(isolation_level="AUTOCOMMIT")
    try:
        acquired = conn.execute(
            text("SELECT GET_LOCK(:name, :timeout)"),
            {"name": lock_name, "timeout": LOCK_TIMEOUT}).scalar()
        if acquired != 1:
            raise Exception("Could not acquire category lock: " + str(category_name))

        # RE-CHECK inside the lock: whoever waited on the lock will now
        # find the category already created and just link it.
        category_info = get_category(product_id)
        if category_info.get('tiendanube_category'):
            logger.info(f"Category: {category_info.get('tiendanube_category')} already exists.")
            data = {'category_id': category_info.get('category_id')}
            _update_record(attrb_id, data, ATTRIBUTES_TABLE)
            return

        creds = get_nube_creds(account_id)
        token = creds.get('access_token')
        user_id = creds.get('user_id')
        url = f"https://api.tiendanube.com/v1/{user_id}/categories"
        
        payload = {
        "name": {
          "es": category_name}}
    
        response = _tn_request("POST", url, token, json_body=payload, timeout=30)
        if response.status_code < 300:
            logger.info(f"Category: {category_name} succesfully created")
            response_dict = response.json()
            category_id = response_dict.get('id')
            response_dict.pop('id')
            catgory_info = response_dict
    
            data = {
            'account_id': account_id, 
            'external_category_id': category_id, 
            'name': category_name, 
            'data': json.dumps(catgory_info), 
            }
            last_id = _insert_record(data, CATEGORIES_TABLE)
    
            data = {'category_id': last_id}
            _update_record(attrb_id, data, ATTRIBUTES_TABLE)
        else:
            logger.error(f'Error creating category {category_name} : {response.json()}')

    finally:
        conn.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": lock_name})
        conn.close()