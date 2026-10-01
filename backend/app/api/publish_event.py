import hashlib
import hmac
from flask import Blueprint, request, jsonify

from app import cache
from app.db.claims import claim, fail, finish, resolve_actor
from app.pipelines.publish import pipeline_publish
from app.utils.logger import logger, set_event_id
from app.db.helpers import get_one
from app.settings.config import SCHEMA_ACCOUNTS, SCHEMA_INVENTORY


publications = Blueprint("wh_publish", __name__, url_prefix="/webhooks/publications")
@publications.route("", methods=["POST"], strict_slashes=False)
def main():
    set_event_id(None)
    raw_body = request.get_data()
    payload = request.get_json(force=True)

    expected = _expected_signature(payload, raw_body)
    if expected is None or not hmac.compare_digest(request.headers.get("X-Signature", ""), expected):
        return jsonify({"status": "unauthorized"}), 401

    # Desactivación estricta: webhooks internos de businesses inactivos se rechazan.
    if not _business_active(payload):
        return jsonify({"status": "rejected", "message": "business inactive"}), 403

    error = _validate_publication(payload)
    if error:
        return jsonify({"status": "rejected", "message": error}), 400

    account_id = payload.get('account_id')
    source = payload.get('source')
    event_type = payload.get('event_type')
    external_id = payload.get('id')
    stored = {k: v for k, v in payload.items() if k != "secret"}

    # Resolve who is acting: default = the business itself.
    try:
        account = get_one(
            "SELECT id, business_id FROM " + SCHEMA_ACCOUNTS + ".accounts WHERE id = :id",
            {"id": account_id})
        actor_id, actor_role = resolve_actor(
            account["business_id"],
            payload.get("actor_role") or "business",
            payload.get("actor_id") or account["business_id"],
        )
    except LookupError:
        return jsonify({"status": "rejected", "message": "unknown account"}), 400
    except ValueError as exc:
        return jsonify({"status": "rejected", "message": str(exc)}), 400

    event_id = claim(account_id, source, event_type, external_id, stored,
                     actor_id=actor_id, actor_role=actor_role)

    if event_id is None:
        # Someone else is already processing this exact request.
        return jsonify({"status": "in_flight"}), 200

    set_event_id(event_id)
    # DEPRECATED (28/09): TODO el webhook interno /webhooks/publications quedó
    # reemplazado por la REST API del dashboard (channels.py llama
    # pipeline_publish directamente para publish/update/pause/delete; el
    # prepublish se cubre con /api/inventory/.../prepublish + /api/mercadolibre/
    # configure). Se mantiene funcional durante el período de prueba del
    # usuario; si todo sigue OK se elimina el endpoint completo.
    logger.warning(
        "DEPRECATED: event %s received via /webhooks/publications (product %s). "
        "El webhook interno será eliminado; usá la REST API del dashboard.",
        payload.get("event_type"),
        payload.get("product_id"),
    )
    try:
        pipeline_publish(payload)
    except Exception:
        fail(event_id)
        logger.exception("publish failed for event %s (external id %s)", event_id, external_id)
        return jsonify({"status": "failed"}), 500

    finish(event_id)
    # La pipeline tocó listados/producto: invalidar la cache del negocio
    # DESPUÉS de la escritura (ver app/cache.py).
    cache.invalidate_business(account.get("business_id"))
    return jsonify({"status": "done"}), 200


def _validate_publication(payload):
    account_id = payload.get('account_id')
    product_id = payload.get('product_id')

    if not account_id or not product_id:
        return "missing account_id or product_id"

    try:
        account = get_one(
            "SELECT business_id, platform FROM " + SCHEMA_ACCOUNTS + ".accounts WHERE id = :id",
            {"id": account_id})
    except LookupError:
        return "unknown account"

    try:
        product = get_one(
            "SELECT business_id FROM " + SCHEMA_INVENTORY + ".products WHERE id = :id",
            {"id": product_id})
    except LookupError:
        return "unknown product"

    if account["business_id"] != product["business_id"]:
        return "product does not belong to this business"

    target = payload.get('target')
    if target and account["platform"] != target:
        return "account platform does not match target"

    return None


def _expected_signature(payload, raw_body):
    account_id = payload.get("account_id")
    if not account_id:
        return None
    try:
        row = get_one(
            "SELECT b.webhook_secret AS secret FROM " + SCHEMA_ACCOUNTS + ".accounts a "
            "JOIN " + SCHEMA_ACCOUNTS + ".businesses b ON b.id = a.business_id "
            "WHERE a.id = :account_id",
            {"account_id": account_id})
    except LookupError:
        return None
    if not row["secret"]:
        return None
    return hmac.new(row["secret"].encode(), raw_body, hashlib.sha256).hexdigest()


def _business_active(payload):
    account_id = payload.get("account_id")
    if not account_id:
        return False
    try:
        row = get_one(
            "SELECT b.active AS active FROM " + SCHEMA_ACCOUNTS + ".accounts a "
            "JOIN " + SCHEMA_ACCOUNTS + ".businesses b ON b.id = a.business_id "
            "WHERE a.id = :account_id",
            {"account_id": account_id})
        return bool(row["active"])
    except LookupError:
        return False