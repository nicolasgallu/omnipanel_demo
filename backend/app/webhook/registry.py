"""Topic -> handler registry for platform webhooks.

New platform = new integration module + one entry here. Handlers receive
(account, notification) and do fetch+upsert only (no business actions).
"""
from app.webhook.topics import (
    claims,
    invoices,
    messages,
    payments,
    price_suggestions,
    promotions,
    shipments,
)

TOPIC_HANDLERS = {
    "mercadolibre": {
        "messages": messages.handle_message,
        "questions": messages.handle_question,
        "price_suggestion": price_suggestions.handle,
        "catalog_item_competition_status": price_suggestions.handle_competition,
        "shipments": shipments.handle,
        "public_offers": promotions.handle_offer,
        "public_candidates": promotions.handle_candidate,
        "post_purchase": claims.handle,
        "payments": payments.handle,
        "invoices": invoices.handle,
    },
}
