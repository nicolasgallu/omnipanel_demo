from app.integrations.mercadolibre.product_handler import publish as meli_publish, update as meli_update, pause as meli_pause, delete as meli_delete
from app.integrations.tiendanube.product_handler import publish as tnube_publish, update as tnube_update, delete as tnube_delete
from app.integrations.mercadolibre.cost_calculator import calculate_cost
from app.utils.logger import logger

def pipeline_publish(payload):

    target = payload.get('target')
    event_type = payload.get('event_type')
    logger.info(f"Event: {event_type} | Target: {target}")

    if event_type == 'publish':
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

