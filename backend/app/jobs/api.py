"""REST API de acciones masivas (contrato del front, Figma v184).

- POST /api/mass-actions/eligibility {product_ids} → {publish: {ml, tn},
  update: {...}, pause: {...}, delete: {...}, link: {...}, unlink: {...}}
  (conteos "N ready" del cartel; la cuenta se resuelve sola por negocio).
- POST /api/mass-actions {action, channel: "ml"|"tn", product_ids} → crea UNA
  ejecución (snapshot de elegibles + queue). El front llama una vez por
  plataforma elegida.
- GET  /api/mass-actions → ejecuciones (MassRun, más nueva primero).
- GET  /api/mass-actions/<id> → MassRun + failures [{product, reason}].
- DELETE /api/mass-actions/<id> → queued: fuera de la fila; running: aborta
  (pending → skipped; lo aplicado queda).

Auth: @require_auth (empleados incluidos, como las acciones individuales de
publicación). Scoping por business_id en cada query (invariante).
"""
import json

from flask import Blueprint, jsonify, request

from app.api.auth_utils import (
    current_business_id,
    current_user,
    require_auth,
)
from app.db.helpers import get_all, get_one
from app.jobs import engine
from app.jobs.eligibility import (
    ACTIONS,
    EligibilityError,
    business_account_id,
    eligibility_counts,
)
from app.settings.config import SCHEMA_ACCOUNTS, SCHEMA_MASS_ACTIONS
from app.utils.logger import logger

mass_actions_bp = Blueprint("mass_actions_api", __name__,
                            url_prefix="/api/mass-actions")

JOBS_TABLE = SCHEMA_MASS_ACTIONS + ".jobs"

# Canal del front ↔ plataforma interna.
CHANNEL_PLATFORM = {"ml": "mercadolibre", "tn": "tiendanube"}
PLATFORM_CHANNEL = {v: k for k, v in CHANNEL_PLATFORM.items()}
# Status del front ↔ status interno del motor.
_STATUS_FRONT = {
    "queued": "queued",
    "running": "running",
    "completed": "done",
    "completed_with_errors": "done_errors",
    "failed": "failed",
    "cancelled": "cancelled",
}
_STATUS_INTERNAL = {
    "queued": "queued",
    "running": "running",
    "done": "completed",
    "done_errors": "completed_with_errors",
    "failed": "failed",
    "cancelled": "cancelled",
}

SELECT_RUN = (
    "SELECT j.id, j.platform, j.action_type, j.account_id, j.status,"
    " j.total_items, j.succeeded, j.failed, j.skipped, j.error,"
    " j.created_at, j.started_at, j.finished_at,"
    " COALESCE(b.full_name, e.full_name, '') AS user_name,"
    " CASE WHEN j.status = 'queued' THEN ("
    "   SELECT COUNT(*) FROM " + JOBS_TABLE + " q"
    "   WHERE q.account_id = j.account_id AND q.status = 'queued'"
    "     AND q.id < j.id) + 1 ELSE NULL END AS queue_position")


def _run_dict(row):
    """Fila de jobs → MassRun del contrato del front."""
    return {
        "id": row["id"],
        "created_at": str(row.get("created_at")),
        "user": row.get("user_name") or "",
        "channel": PLATFORM_CHANNEL.get(row["platform"], row["platform"]),
        "action": row["action_type"],
        "total": row["total_items"],
        "ok": row["succeeded"],
        "errors": row["failed"],
        "skipped": row["skipped"],
        "status": _STATUS_FRONT.get(row["status"], row["status"]),
        "queue_position": row.get("queue_position"),
    }


def _bad(message, code=400):
    return jsonify({"error": "bad_request", "message": message}), code


# ─── eligibilidad (el cartel) ─────────────────────────────────────────────────

@mass_actions_bp.route("/eligibility", methods=["POST"])
@require_auth
def eligibility():
    data = request.get_json(silent=True) or {}
    product_ids = data.get("product_ids") or []
    if not isinstance(product_ids, list) or not product_ids:
        return jsonify({"products": 0,
                        **{a: {"ml": 0, "tn": 0} for a in ACTIONS}})
    try:
        counts = eligibility_counts(current_business_id(), product_ids)
    except EligibilityError as exc:
        return _bad(str(exc))
    return jsonify({
        "products": len(set(product_ids)),
        **{a: {"ml": counts[a]["mercadolibre"],
               "tn": counts[a]["tiendanube"]} for a in ACTIONS},
    })


# ─── crear / listar / detalle / eliminar ──────────────────────────────────────

@mass_actions_bp.route("", methods=["POST"])
@require_auth
def create():
    data = request.get_json(silent=True) or {}
    action = (data.get("action") or "").strip()
    channel = (data.get("channel") or "").strip()
    product_ids = data.get("product_ids") or []
    if action not in ACTIONS:
        return _bad("Acción inválida")
    if channel not in CHANNEL_PLATFORM:
        return _bad("Elegí un canal (ml o tn)")
    if not isinstance(product_ids, list) or not product_ids:
        return _bad("Seleccioná al menos un producto")

    platform = CHANNEL_PLATFORM[channel]
    account_id = business_account_id(current_business_id(), platform)
    if not account_id:
        return jsonify({"error": "no_account",
                        "message": "No tenés una cuenta conectada para " + channel}), 400

    user = current_user()
    try:
        job = engine.create_job(
            current_business_id(), user.get("id"), user.get("role"),
            platform, account_id, action, product_ids)
    except EligibilityError as exc:
        logger.info("mass_action=create_rejected channel=%s reason=%s", channel, exc)
        return jsonify({"error": "nothing_to_run", "message": str(exc)}), 400

    row = get_one(
        "SELECT j.*, COALESCE(b.full_name, e.full_name, '') AS user_name"
        " FROM " + JOBS_TABLE + " j"
        " LEFT JOIN " + SCHEMA_ACCOUNTS + ".businesses b"
        "   ON b.id = j.created_by AND j.created_by_role = 'business'"
        " LEFT JOIN " + SCHEMA_ACCOUNTS + ".employees e"
        "   ON e.id = j.created_by AND j.created_by_role = 'employee'"
        " WHERE j.id = :id", {"id": job["id"]})
    return jsonify({"run": _run_dict(row)}), 202


@mass_actions_bp.route("", methods=["GET"])
@require_auth
def list_runs():
    channel = (request.args.get("channel") or "").strip()
    status = (request.args.get("status") or "").strip()
    page = max(int(request.args.get("page", 0)), 0)
    page_size = min(max(int(request.args.get("page_size", 100)), 1), 500)

    filters = " WHERE j.business_id = :b"
    params = {"b": current_business_id()}
    if channel and channel in CHANNEL_PLATFORM:
        filters += " AND j.platform = :p"
        params["p"] = CHANNEL_PLATFORM[channel]
    if status and status in _STATUS_INTERNAL:
        filters += " AND j.status = :s"
        params["s"] = _STATUS_INTERNAL[status]

    total = get_one(
        "SELECT COUNT(*) AS n FROM " + JOBS_TABLE + " j" + filters,
        params)["n"]
    rows = get_all(
        SELECT_RUN
        + " FROM " + JOBS_TABLE + " j"
        + " LEFT JOIN " + SCHEMA_ACCOUNTS + ".businesses b"
        + "   ON b.id = j.created_by AND j.created_by_role = 'business'"
        + " LEFT JOIN " + SCHEMA_ACCOUNTS + ".employees e"
        + "   ON e.id = j.created_by AND j.created_by_role = 'employee'"
        + filters
        + " ORDER BY j.id DESC LIMIT :l OFFSET :o",
        {**params, "l": page_size, "o": page * page_size})
    return jsonify({"items": [_run_dict(r) for r in rows],
                    "total": total, "page": page, "page_size": page_size})


@mass_actions_bp.route("/<int:job_id>", methods=["GET"])
@require_auth
def get_run(job_id):
    try:
        row = get_one(
            SELECT_RUN
            + " FROM " + JOBS_TABLE + " j"
            + " LEFT JOIN " + SCHEMA_ACCOUNTS + ".businesses b"
            + "   ON b.id = j.created_by AND j.created_by_role = 'business'"
            + " LEFT JOIN " + SCHEMA_ACCOUNTS + ".employees e"
            + "   ON e.id = j.created_by AND j.created_by_role = 'employee'"
            + " WHERE j.id = :id AND j.business_id = :b",
            {"id": job_id, "b": current_business_id()})
    except LookupError:
        return jsonify({"error": "not_found",
                        "message": "Ejecución no encontrada"}), 404

    failed_page = max(int(request.args.get("failed_page", 0)), 0)
    failed_page_size = min(max(int(request.args.get("failed_page_size", 100)), 1), 500)
    failures = get_all(
        "SELECT p.name AS product, i.reason"
        " FROM " + SCHEMA_MASS_ACTIONS + ".job_items i"
        " LEFT JOIN inventory.products p ON p.id = i.product_id"
        " WHERE i.job_id = :j AND i.status = 'failed'"
        " ORDER BY i.id ASC LIMIT :l OFFSET :o",
        {"j": job_id, "l": failed_page_size, "o": failed_page * failed_page_size})
    out = _run_dict(row)
    out["failures"] = failures
    return jsonify(out)


@mass_actions_bp.route("/<int:job_id>", methods=["DELETE"])
@require_auth
def delete_run(job_id):
    try:
        job = engine.delete_job(current_business_id(), job_id)
    except LookupError:
        return jsonify({"error": "not_found",
                        "message": "Ejecución no encontrada"}), 404
    except EligibilityError as exc:
        return jsonify({"error": "conflict", "message": str(exc)}), 409
    return jsonify({"id": job["id"],
                    "status": _STATUS_FRONT.get(job["status"], job["status"]),
                    "skipped": job["skipped"]})
