"""Endpoints internos del worker separado (mass-actions-worker/).

El worker hace pull:
  POST /internal/mass-actions/next            → próximo lote claimado o idle
  POST /internal/mass-actions/items/<id>/execute → ejecutar un ítem
  POST /internal/mass-actions/advance         → cierre del lote (heartbeat/
                                                 cerrar job si no quedan)

Auth: secreto compartido `MASS_ACTIONS_INTERNAL_TOKEN` (Bearer). Vacío = sin
auth (dev/tests). En prod el mismo valor vive en el worker y acá.
"""
import hmac
import uuid

from flask import Blueprint, jsonify, request

from app.jobs import engine
from app.settings.config import MASS_ACTIONS_INTERNAL_TOKEN
from app.utils.logger import logger, set_event_id

mass_actions_internal = Blueprint("mass_actions_internal", __name__,
                                  url_prefix="/internal/mass-actions")


def _authorized():
    expected = MASS_ACTIONS_INTERNAL_TOKEN
    if not expected:
        return True  # dev/tests
    header = request.headers.get("Authorization", "")
    token = header[7:] if header.startswith("Bearer ") else None
    return bool(token) and hmac.compare_digest(token, expected)


def _unauthorized():
    return jsonify({"error": "unauthorized",
                    "message": "Token inválido"}), 401


@mass_actions_internal.before_request
def _tag():
    set_event_id("worker-" + uuid.uuid4().hex[:8])


@mass_actions_internal.route("/next", methods=["POST"])
def next_batch():
    if not _authorized():
        return _unauthorized()
    try:
        return jsonify(engine.next_batch())
    except Exception:
        logger.exception("Internal next failed")
        return jsonify({"error": "internal_error",
                        "message": "No se pudo claimar un lote"}), 500


@mass_actions_internal.route("/items/<int:item_id>/execute", methods=["POST"])
def execute_item(item_id):
    if not _authorized():
        return _unauthorized()
    try:
        return jsonify(engine.execute_item(item_id))
    except Exception:
        logger.exception("Internal execute failed for item %s", item_id)
        return jsonify({"error": "internal_error",
                        "message": "El ítem no se pudo ejecutar"}), 500


@mass_actions_internal.route("/advance", methods=["POST"])
def advance():
    if not _authorized():
        return _unauthorized()
    data = request.get_json(silent=True) or {}
    job_id = data.get("job_id")
    if not job_id:
        return jsonify({"error": "bad_request", "message": "Falta job_id"}), 400
    try:
        return jsonify(engine.advance_job(int(job_id)))
    except LookupError:
        return jsonify({"continue": False})
    except Exception:
        logger.exception("Internal advance failed for job %s", job_id)
        return jsonify({"error": "internal_error",
                        "message": "No se pudo avanzar el job"}), 500
