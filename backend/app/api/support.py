"""Soporte: tickets de los negocios.

POST /api/support/tickets -> crea un ticket (asunto + descripción + prioridad)
GET  /api/support/tickets -> lista los tickets del business

Tabla: platform_accounts.support_tickets (crearla con el SQL de
backend_tables.md). Todo va scoped por business_id del token.
"""
from flask import Blueprint, jsonify, request

from app.api.auth_utils import current_business_id, require_auth
from app.api.inventory import _serializable
from app.db.helpers import get_all, insert_and_get_id
from app.settings.config import SCHEMA_ACCOUNTS
from app.utils.logger import logger

support_bp = Blueprint("support_api", __name__, url_prefix="/api")

TICKETS_TABLE = SCHEMA_ACCOUNTS + ".support_tickets"
VALID_PRIORITIES = ("low", "normal", "high", "urgent")


@support_bp.route("/support/tickets", methods=["POST"])
@require_auth
def create_ticket():
    data = request.get_json(silent=True) or {}
    subject = (data.get("subject") or "").strip()
    description = (data.get("description") or "").strip()
    priority = (data.get("priority") or "normal").strip().lower()

    if not subject:
        return jsonify({"error": "bad_request",
                        "message": "El asunto es obligatorio"}), 400
    if not description:
        return jsonify({"error": "bad_request",
                        "message": "La descripción es obligatoria"}), 400
    if priority not in VALID_PRIORITIES:
        return jsonify({"error": "bad_request",
                        "message": "Prioridad inválida (low, normal, high, urgent)"}), 400

    ticket_id = insert_and_get_id(
        "INSERT INTO " + TICKETS_TABLE
        + " (business_id, subject, description, status, priority)"
        + " VALUES (:b, :subject, :description, 'open', :priority)",
        {"b": current_business_id(), "subject": subject,
         "description": description, "priority": priority})

    logger.info("Support ticket %s creado por business %s",
                ticket_id, current_business_id())
    return jsonify({"id": ticket_id}), 201


@support_bp.route("/support/tickets", methods=["GET"])
@require_auth
def list_tickets():
    rows = get_all(
        "SELECT id, subject, description, status, priority,"
        " created_at, updated_at, closed_at FROM " + TICKETS_TABLE
        + " WHERE business_id = :b ORDER BY created_at DESC, id DESC",
        {"b": current_business_id()})
    return jsonify({"items": [{
        "id": r["id"],
        "subject": r.get("subject"),
        "description": r.get("description"),
        "status": r.get("status"),
        "priority": r.get("priority"),
        "created_at": _serializable(r.get("created_at")),
        "updated_at": _serializable(r.get("updated_at")),
        "closed_at": _serializable(r.get("closed_at")),
    } for r in rows]})
