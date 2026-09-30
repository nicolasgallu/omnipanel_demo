import asyncio
from app.integrations.core.ai_completation import ai_call_prepublish
from app.integrations.mercadolibre.grid_size import create_template, create_grid
from app.integrations.mercadolibre.product_handler import prepublish, publish as meli_publish, update as meli_update, pause as meli_pause, delete as meli_delete
from app.integrations.tiendanube.product_handler import create_categories, publish as tnube_publish, update as tnube_update, delete as tnube_delete
from app.integrations.mercadolibre.ai_images import meli_ai_pictures
from app.integrations.mercadolibre.cost_calculator import calculate_cost
from app.utils.logger import logger

def pipeline_publish(payload):

    target = payload.get('target')
    event_type = payload.get('event_type')
    logger.info(f"Event: {event_type} | Target: {target}")
    
    if event_type == 'prepublish':
        # DEPRECATED (28/09): el flujo prepublish del webhook interno quedó
        # reemplazado por la REST API del dashboard:
        #   - IA: POST /api/inventory/products/{id}/prepublish
        #   - settings de categoría: POST /api/mercadolibre/configure
        # Se mantiene funcional durante el período de prueba del usuario;
        # si todo sigue OK se elimina junto con prepublish()/
        # _generate_category_options/ai_call_prepublish.
        logger.warning(
            "DEPRECATED: prepublish event received via webhook (product %s). "
            "Este flujo será eliminado; usá la REST API del dashboard.",
            payload.get("product_id"),
        )
        asyncio.run(ai_call_prepublish(payload))
        if target == "mercadolibre":
            prepublish(payload)
        elif target == "tiendanube":
            create_categories(payload)

    elif event_type == 'publish':
        if target == "mercadolibre":
            # Only refresh costs when the item actually exists (publish
            # succeeded or was already published) — never after a failure.
            if meli_publish(payload):
                _safe_calculate_cost(payload)
        elif target == "tiendanube":
            tnube_publish(payload)

    elif event_type == 'update':
        if target == "mercadolibre":
            meli_update(payload)
            # Best-effort: el refresh de costos NUNCA debe fallar la acción
            # (Meli puede rechazar el cálculo de envío y el update ya aplicó).
            _safe_calculate_cost(payload)
        elif target == "tiendanube":
            tnube_update(payload)

    elif event_type == 'pause':
        if target == "mercadolibre":
            meli_pause(payload)

    elif event_type == 'delete':
        if target == "mercadolibre":
            meli_delete(payload)
        elif target == "tiendanube":
            tnube_delete(payload)

    elif event_type == 'meli_pictures':
        # DEPRECATED (28/09): solo alcanzable vía webhook interno. El dashboard
        # descarga las fotos con POST /api/mercadolibre/pictures (channels.py).
        logger.warning(
            "DEPRECATED: meli_pictures event received via webhook (product %s). "
            "Será eliminado.",
            payload.get("product_id"),
        )
        meli_ai_pictures(payload)

    elif event_type == "create_template":
        # DEPRECATED (28/09): solo alcanzable vía webhook interno; no hay flujo
        # equivalente en el dashboard.
        logger.warning(
            "DEPRECATED: create_template event received via webhook (product %s). "
            "Será eliminado.",
            payload.get("product_id"),
        )
        create_template(payload)
        tnube_update(payload)
        
    elif event_type == "create_size_grid":
        # DEPRECATED (28/09): solo alcanzable vía webhook interno; no hay flujo
        # equivalente en el dashboard.
        logger.warning(
            "DEPRECATED: create_size_grid event received via webhook (product %s). "
            "Será eliminado.",
            payload.get("product_id"),
        )
        create_grid(payload)
                
    else:
        return

def _safe_calculate_cost(payload):
    """Refresh de costos de venta no-bloqueante: si Meli rechaza el cálculo
    (p. ej. shipping_options 400 por dimensiones), se loguea y la acción del
    usuario queda como exitosa — el precio/stock ya se aplicaron."""
    try:
        calculate_cost(payload)
    except Exception:
        logger.exception("calculate_cost failed (non-blocking) for product %s",
                         payload.get("product_id"))

