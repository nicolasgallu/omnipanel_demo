"""Backfill histórico de órdenes (MercadoLibre + TiendaNube).

Estrategia PULL-first / LOAD-second, SIN efectos secundarios:
- pagina el listado del canal (ML /orders/search, TN /v1/{store}/orders);
- por cada orden llama a record_order() (upsert idempotente por
  account_id + order_id);
- NUNCA pasa por sells.py / process_order / claim -> no toca stock, no postea
  a Bitcram, no notifica, no responde IA.

Reusable para cualquier cuenta/business: recibe un account dict ya resuelto
(id, platform, external_account_id, business_id).
"""
from app.integrations.core.order_records import record_order
from app.integrations.mercadolibre.orders import fetch_orders_page as ml_page
from app.integrations.tiendanube.orders import fetch_orders_page as tn_page

ML_PAGE = 50
TN_PAGE = 200


def backfill_orders(account, dry_run=True, preview_limit=0):
    """Recorre TODAS las órdenes de la cuenta y las registra (sin acciones).

    Devuelve {"fetched", "written", "errors", "previews"}.
    `preview_limit` > 0 devuelve las primeras N órdenes crudas en `previews`
    (para validar el shape antes de escribir).
    """
    platform = account["platform"]
    fetched = written = 0
    errors = []
    previews = []

    def _record(order):
        order_id = str(order.get("id"))
        if len(previews) < preview_limit:
            previews.append((platform, order))
        if not dry_run:
            record_order(account, platform, order_id, order)
            return 1
        return 0

    if platform == "mercadolibre":
        offset = 0
        while True:
            try:
                results, total = ml_page(account, offset=offset, limit=ML_PAGE)
            except Exception as exc:
                errors.append("ML page offset=%s: %s" % (offset, exc))
                break
            if not results:
                break
            for order in results:
                fetched += 1
                try:
                    written += _record(order)
                except Exception as exc:
                    errors.append("ML order %s: %s" % (order.get("id"), exc))
            offset += len(results)
            if offset >= total:
                break
    else:  # tiendanube
        page = 1
        while True:
            try:
                orders = tn_page(account, page=page, per_page=TN_PAGE)
            except Exception as exc:
                errors.append("TN page %s: %s" % (page, exc))
                break
            if not orders:
                break
            for order in orders:
                fetched += 1
                try:
                    written += _record(order)
                except Exception as exc:
                    errors.append("TN order %s: %s" % (order.get("id"), exc))
            if len(orders) < TN_PAGE:
                break
            page += 1

    return {"fetched": fetched, "written": written,
            "errors": errors, "previews": previews}
