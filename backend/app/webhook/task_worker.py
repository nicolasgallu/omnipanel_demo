"""Worker interno de Cloud Tasks: /internal/tasks/webhook.

Cloud Tasks llama este endpoint con el payload {account_id, topic,
notification} y un token OIDC cuya audience es la URL pública del worker
(TASKS_WORKER_URL). El worker:

1. valida el OIDC (prod / TASKS_VERIFY_AUTH=1; en dev se llama directo),
2. re-resuelve la cuenta por id y chequea negocio activo (scoping: NUNCA
   confía en el payload de la task),
3. corre el handler del registry (fetch a Meli + upsert).

Responde 200 si el handler completa y 500 si lanza excepción (Cloud Tasks
reintenta con backoff). Es seguro re-ejecutar: los handlers son upserts
idempotentes por unique key y el inbox ya dedupeó el evento.
"""
import os
import uuid

from flask import Blueprint, jsonify, request

from app.db.helpers import get_one
from app.integrations.core.credentials import is_business_active
from app.settings.config import SCHEMA_ACCOUNTS
from app.utils.logger import logger, set_event_id

task_worker = Blueprint("wh_task_worker", __name__, url_prefix="/internal/tasks")

ACCOUNTS_TABLE = SCHEMA_ACCOUNTS + ".accounts"


def _oidc_enforced():
    """OIDC obligatorio en prod (backend cloudtasks) o si se fuerza por env."""
    return (os.getenv("TASKS_BACKEND") or "stub") == "cloudtasks" \
        or os.getenv("TASKS_VERIFY_AUTH") == "1"


def _verify_oidc():
    """Valida el Authorization: Bearer <token OIDC de Cloud Tasks> con la
    audience = TASKS_WORKER_URL. False ante cualquier token inválido."""
    header = request.headers.get("Authorization", "")
    token = header[7:] if header.startswith("Bearer ") else None
    if not token:
        return False
    try:
        from google.auth.transport import requests as gauth_requests
        from google.oauth2 import id_token

        audience = os.getenv("TASKS_WORKER_URL")
        claims = id_token.verify_oauth2_token(
            token, gauth_requests.Request(), audience=audience)
        return claims is not None
    except Exception:
        logger.exception("Invalid OIDC token on task worker")
        return False


@task_worker.route("/webhook", methods=["POST"])
def webhook():
    set_event_id("task-" + uuid.uuid4().hex[:8])
    if _oidc_enforced() and not _verify_oidc():
        return jsonify({"error": "unauthorized", "message": "Token inválido"}), 401

    data = request.get_json(silent=True) or {}
    account_id = data.get("account_id")
    topic = data.get("topic")
    notification = data.get("notification") if isinstance(data.get("notification"), dict) else {}
    if not account_id or not topic:
        return jsonify({"error": "bad_request",
                        "message": "Faltan account_id o topic en la tarea"}), 400

    try:
        account = get_one(
            "SELECT * FROM " + ACCOUNTS_TABLE + " WHERE id = :id",
            {"id": int(account_id)})
    except (LookupError, TypeError, ValueError):
        logger.warning("Task worker: unknown account %s", account_id)
        return jsonify({"status": "ignored", "message": "unknown account"}), 200

    # Desactivación estricta: tasks de negocios inactivos no se procesan.
    if not is_business_active(account):
        logger.info("Task worker: ignoring topic %s for inactive business %s",
                    topic, account.get("business_id"))
        return jsonify({"status": "ignored", "message": "inactive business"}), 200

    handler = _lookup_handler(topic)
    if handler is None:
        # Topic sin handler (o dado de baja): nada que hacer, ack 200.
        logger.info("Task worker: no handler for topic %s", topic)
        return jsonify({"status": "done"}), 200

    try:
        handler(account, notification)
    except Exception:
        # 500 -> Cloud Tasks reintenta con backoff.
        logger.exception("Task worker handler failed for topic %s", topic)
        return jsonify({"error": "handler_failed",
                        "message": "El handler del topic falló"}), 500
    return jsonify({"status": "done"}), 200


def _lookup_handler(topic):
    try:
        from app.webhook.registry import TOPIC_HANDLERS
        return TOPIC_HANDLERS.get("mercadolibre", {}).get(topic)
    except Exception:
        logger.exception("Could not load topic registry")
        return None
