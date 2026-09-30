import asyncio
from app.utils.logger import logger
from app.service.llm_api import call_deepseek_api
from app.integrations.mercadolibre.product_handler import get_data_for_meli
from app.settings.config import SCHEMA_INVENTORY, SCHEMA_AI
from app.db.helpers import get_one, execute
from sqlalchemy.exc import IntegrityError

PRODUCTS_TABLE = 'products'
PROMPTS_TABLE = 'prompts'
ATTRIBUTES_TABLE= 'attributes'
PRODUCT_LISTING_TABLE= 'product_listings'

#crear prompts table en un lugar centralizado.
#recordarfiltar por account_id ya que cada account tiene su criterio.
#AVISARLE A LEA QUE EL CONTRATO DEL PAYLOAD PARA PROMPTS CAMBIO.
#AHORA LOS CAMPOS SIGUEN VINIENDO EN DATA PERO EL NOMBRE DE MELI CAMBIO A name_edited.
#RESOLVER SI ES QUE ME MANDA MAL ALGO..


def _aux_get_ai_prompt(business_id):
    """Prompts de generación del negocio (ai.prompts, una fila por business).

    Devuelve {} si el negocio no tiene fila: el caller usa los defaults.
    """
    sql = (
        "SELECT "
        + "ai_generate_title, "
        + "ai_generate_description, "
        + "ai_generate_brand, "
        + "ai_generate_model "
        + "FROM " + SCHEMA_AI + "." + PROMPTS_TABLE
        + " WHERE business_id = :b"
    )
    try:
        return get_one(sql, {"b": business_id})
    except LookupError:
        return {}


# Defaults (los mismos del flujo vivo prepublish): se usan cuando el negocio
# no cargó sus prompts en ai.prompts.
DEFAULT_AI_PROMPTS = {
    "ai_generate_title": ("Sos un redactor experto en ecommerce. Mejorá el título del producto."
                          " OBLIGATORIO: devolvé SOLO el título, máx. 60 caracteres, sin comillas ni comentarios."),
    "ai_generate_description": ("Sos un redactor experto en ecommerce. Escribí la descripción del producto."
                                " OBLIGATORIO: devolvé SOLO la descripción, sin comillas ni comentarios."),
    "ai_generate_brand": ("Indicá únicamente la marca del producto. Si no podés determinarla, respondé 'Genérico'."
                          " OBLIGATORIO: devolvé SOLO la marca."),
    "ai_generate_model": ("Indicá únicamente el modelo del producto. Si no existe, generá un código corto."
                          " OBLIGATORIO: devolvé SOLO el modelo."),
}


def _update_products(product_id, data):
    fields = []
    params = {"id": product_id}
    for field, value in data.items():
        if value is not None:
            fields.append(f"{field} = :{field}")
            params[field] = value
    if not fields:
        return
    
    sql = (
        "UPDATE " + SCHEMA_INVENTORY + "." + PRODUCTS_TABLE
        + " SET " + ", ".join(fields)
        + " WHERE id = :id"
    )
    execute(sql, params)


def insert_product_listing(product_id, schema, account_id):
    try:
        # Try to insert product_listing (ignore if exists)
        execute(
            f"""
            INSERT IGNORE INTO {schema}.{PRODUCT_LISTING_TABLE} 
            (product_id, account_id) 
            VALUES (:product_id, :account_id)
            """,
            {"product_id": product_id, "account_id": account_id}
        )
        
        # Get the listing ID (always exists now)
        result = get_one(
            f"""SELECT id FROM {schema}.{PRODUCT_LISTING_TABLE} 
             WHERE product_id = :product_id AND account_id = :account_id""",
            {"product_id": product_id, "account_id": account_id}
        )
        listing_id = result['id']
        
        # Try to insert attributes (ignore if exists)
        execute(
            f"""
            INSERT IGNORE INTO {schema}.{ATTRIBUTES_TABLE} 
            (product_listing_id) 
            VALUES (:listing_id)
            """,
            {"listing_id": listing_id}
        )
        
        logger.info(f"Listing ensured for product {product_id} | schema: {schema} | id: {listing_id}")
        return listing_id
        
    except IntegrityError as e:
        logger.warning(f"Integrity error for product {product_id}: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to create listing: {e}")
        return None

async def _call_ai(sys_prompt, user_prompt):
    return await asyncio.to_thread( call_deepseek_api, sys_prompt, user_prompt)


async def ai_call_prepublish(payload):
    """DEPRECATED (28/09): solo lo usa el prepublish del webhook interno.

    El dashboard completa los campos con IA vía
    POST /api/inventory/products/{id}/prepublish (inventory.py), que tiene su
    propia lógica con fallbacks. Se mantiene funcional durante el período de
    prueba; si todo sigue OK se elimina.
    """

    ##CHEQUEAR EL CONTRATO A ESTE NIVEL,
    ##SI EXISTE DATA PERO NO HAY PROMPT ROMPER.
    #if not prompt:return
    #user_prompt.get('prompt') and user_prompt.get('field'):
    user_prompt = payload.get('data')
    
    product_id = payload.get('product_id')
    account_id = payload.get('account_id')
    target = payload.get('target')
    insert_product_listing(product_id, target, account_id)

    # Prompts del negocio dueño de la cuenta (fallback a defaults).
    prompts = dict(DEFAULT_AI_PROMPTS)
    try:
        account = get_one(
            "SELECT business_id FROM platform_accounts.accounts WHERE id = :a",
            {"a": account_id})
        row = _aux_get_ai_prompt(account["business_id"])
    except Exception:
        row = {}
    for k, v in (row or {}).items():
        if v:
            prompts[k] = v
    item_data = get_data_for_meli(product_id)
    
    name_original = item_data.get('name')
    name_edited = item_data.get('name_edited')
    description = item_data.get('description')
    brand = item_data.get('brand')
    model = item_data.get('model')
    
    if not user_prompt and name_edited and description and brand and model:
        logger.info("AI Automatic - All product fields already filled, skipping AI.")
        return

    if user_prompt:
        logger.info("Received a user prompt action")
        prompt = user_prompt.get('prompt')
        if user_prompt.get('field') == 'name_edited':
            currentvalue = name_edited or name_original
            column = 'name_edited'
        else:
            currentvalue = description
            column = 'description'

        sys_prompt = (
            "corregi este dato que te voy a dar segun mi prompt."
            +"(OBLIGATORIO: devolve solo el resultado mejorado, sin comments ni nada extra)."
            +"dato a corregir: " 
            + currentvalue
        )

        ai_response = await _call_ai(sys_prompt, prompt)
        data = {column: ai_response}
        _update_products(product_id, data)
        return


    tasks = []

    if not name_edited or name_edited == '':
        logger.info("AI Automatic - Creating Product Name Improved.")
        sys_prompt = prompts['ai_generate_title']
        ai_user_prompt = {"original_name": name_original}
        tasks.append(_call_ai(sys_prompt, ai_user_prompt))
    else:
        tasks.append(None)

    if not description or description == '':
        logger.info("AI Automatic - Creating Description.")
        sys_prompt = prompts['ai_generate_description']
        ai_user_prompt = {"original_name": name_original}
        tasks.append(_call_ai(sys_prompt, ai_user_prompt))
    else:
        tasks.append(None)

    if not brand or brand == '':
        logger.info("AI Automatic - Creating Brand.")
        sys_prompt = prompts['ai_generate_brand']
        ai_user_prompt = {"original_name": name_original}
        tasks.append(_call_ai(sys_prompt, ai_user_prompt))
    else:
        tasks.append(None)

    if not model or model == '':
        logger.info("AI Automatic - Creating Model.")
        sys_prompt = prompts['ai_generate_model']
        ai_user_prompt = {"original_name": name_original}
        tasks.append(_call_ai(sys_prompt, ai_user_prompt))
    else:
        tasks.append(None)

    results = await asyncio.gather(*[ task if task is not None else asyncio.sleep(0, result=None) for task in tasks])
    product_name_response, description_response, brand_response, model_response = results

    data = {
    "name_edited": product_name_response,
    "description": description_response,
    "brand": brand_response,
    "model": model_response,
    }

    _update_products(product_id, data)