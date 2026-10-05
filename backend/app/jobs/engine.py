"""Motor de jobs de acciones masivas (FIFO por cuenta, lotes idempotentes).

Contrato con el worker separado (mass-actions-worker/): el worker NO toca la
DB ni el pipeline. Hace pull de /internal/mass-actions/next (recibe un lote
claimado), ejecuta cada ítem vía /internal/mass-actions/items/<id>/execute y
cierra el lote con /internal/mass-actions/advance. Todo el estado vive acá.

Concurrencia:
- UN solo job `running` por cuenta (dispatch atómico) → FIFO real; cuentas
  distintas corren en paralelo.
- Lotes idempotentes: cada next genera un `claim_token` y solo los ítems
  claimados por ese token son los que ejecuta el worker.
- Lease: heartbeat en next/advance. Reclaim (oportunista, se corre en cada
  next): un job `running` sin heartbeat hace más de RECLAIM_SECONDS se marca
  `failed` ("worker perdido") y libera su cuenta; los ítems `running` viejos
  vuelven a `pending` para ser re-claimados.

El paso "ejecutar 1 ítem" compone el MISMO pipeline que el botón individual
(pipeline_publish) — la acción masiva se comporta igual que la individual.
"""
import json
import uuid

from app import cache
from app.db.claims import claim, fail, finish
from app.db.helpers import execute, get_all, get_one
from app.settings.config import (
    MASS_ACTIONS_BATCH_SIZE,
    MASS_ACTIONS_RECLAIM_SECONDS,
    SCHEMA_MASS_ACTIONS,
    SCHEMA_MERCADOLIBRE,
    SCHEMA_TIENDANUBE,
)
from app.utils.logger import logger

from app.jobs.eligibility import (
    ACTIONS,
    PLATFORMS,
    EligibilityError,
    eligible_product_ids,
)

JOBS_TABLE = SCHEMA_MASS_ACTIONS + ".jobs"
ITEMS_TABLE = SCHEMA_MASS_ACTIONS + ".job_items"
ML_LISTINGS_TABLE = SCHEMA_MERCADOLIBRE + ".product_listings"
TN_LISTINGS_TABLE = SCHEMA_TIENDANUBE + ".product_listings"

JOB_TERMINAL = ("completed", "completed_with_errors", "failed", "cancelled")


def _job(job_id):
    try:
        return get_one("SELECT * FROM " + JOBS_TABLE + " WHERE id = :id",
                       {"id": job_id})
    except LookupError:
        raise LookupError("Job no encontrado")


def create_job(business_id, actor_id, actor_role, platform, account_id,
               action, product_ids):
    """Snapshot de los productos elegibles + job `queued`. El dispatch lo hace
    el worker en su próximo next()."""
    if platform not in PLATFORMS or action not in ACTIONS:
        raise EligibilityError("Acción o plataforma inválida")
    eligible = eligible_product_ids(
        business_id, platform, account_id, action, product_ids)
    if not eligible:
        raise EligibilityError(
            "Ninguna de las publicaciones seleccionadas puede ejecutar esta acción")

    payload = json.dumps({
        "platform": platform, "action": action, "account_id": account_id,
        "selected": len(list(dict.fromkeys(product_ids))),
        "eligible": len(eligible),
    }, ensure_ascii=False)
    job_id = _insert_job(business_id, platform, action, account_id,
                         len(eligible), payload, actor_id, actor_role)

    for i in range(0, len(eligible), 500):
        chunk = eligible[i:i + 500]
        values = []
        params = {"job": job_id}
        for n, pid in enumerate(chunk):
            key = "p" + str(n)
            values.append("(:job, :" + key + ")")
            params[key] = pid
        execute(
            "INSERT INTO " + ITEMS_TABLE + " (job_id, product_id) VALUES "
            + ", ".join(values), params)

    # Auditoría: UNA fila de events por job (actor + payload), correlacionada
    # con los logs vía [event=<id>]. El detalle por ítem vive en job_items.
    event_id = None
    try:
        event_id = claim(account_id, "dashboard", "bulk_" + action,
                         "job-" + str(job_id), json.loads(payload),
                         actor_id=actor_id, actor_role=actor_role)
    except Exception:
        logger.exception("Could not claim audit event for job %s", job_id)
    if event_id:
        execute("UPDATE " + JOBS_TABLE + " SET event_id = :e WHERE id = :id",
                {"e": event_id, "id": job_id})

    logger.info("mass_action=created job=%s business=%s platform=%s action=%s"
                " items=%d", job_id, business_id, platform, action, len(eligible))
    _kick_ticket()  # el job queued necesita su primer ticket de lote
    return _job(job_id)


def _insert_job(business_id, platform, action, account_id, total, payload,
                actor_id, actor_role):
    from app.db.helpers import insert_and_get_id
    return insert_and_get_id(
        "INSERT INTO " + JOBS_TABLE
        + " (business_id, platform, action_type, account_id, total_items,"
        + "  payload, created_by, created_by_role)"
        + " VALUES (:b, :p, :a, :acc, :t, :pl, :by, :role)",
        {"b": business_id, "p": platform, "a": action, "acc": account_id,
         "t": total, "pl": payload, "by": actor_id, "role": actor_role})


# ─── FIFO por cuenta ──────────────────────────────────────────────────────────

def dispatch_due():
    """Inicia el job `queued` más viejo de cada cuenta que esté libre."""
    started = 0
    for row in get_all(
            "SELECT DISTINCT account_id FROM " + JOBS_TABLE
            + " WHERE status = 'queued'"):
        started += 1 if dispatch_account(row["account_id"]) else 0
    return started


def dispatch_account(account_id):
    """Inicia el próximo job queued de la cuenta SI la cuenta está libre.
    La transición es atómica: dos workers llamando a la vez no pueden iniciar
    dos jobs de la misma cuenta (NOT EXISTS running)."""
    try:
        row = get_one(
            "SELECT id FROM " + JOBS_TABLE
            + " WHERE account_id = :a AND status = 'queued'"
            + " ORDER BY id ASC LIMIT 1", {"a": account_id})
    except LookupError:
        return False
    n = execute(
        "UPDATE " + JOBS_TABLE
        + " SET status = 'running', started_at = NOW(), heartbeat_at = NOW()"
        + " WHERE id = :id AND status = 'queued'"
        + " AND NOT EXISTS (SELECT 1 FROM (SELECT 1 FROM " + JOBS_TABLE
        + "   WHERE account_id = :a AND status = 'running') AS _x)",
        {"id": row["id"], "a": account_id})
    if n == 1:
        logger.info("mass_action=dispatched job=%s account=%s", row["id"], account_id)
    return n == 1


def reclaim_stale():
    """Reclamo oportunista (sin scheduler): jobs running muertos → failed y
    cuenta liberada; ítems running viejos → pending."""
    ttl = int(MASS_ACTIONS_RECLAIM_SECONDS)
    lost = get_all(
        "SELECT id, event_id FROM " + JOBS_TABLE
        + " WHERE status = 'running'"
        + " AND (heartbeat_at IS NULL OR heartbeat_at < NOW() - INTERVAL "
        + str(ttl) + " SECOND)")
    n_jobs = execute(
        "UPDATE " + JOBS_TABLE
        + " SET status = 'failed', finished_at = NOW(),"
        + "     error = 'Worker perdido: sin heartbeat'"
        + " WHERE status = 'running'"
        + " AND (heartbeat_at IS NULL OR heartbeat_at < NOW() - INTERVAL "
        + str(ttl) + " SECOND)")
    n_items = execute(
        "UPDATE " + ITEMS_TABLE
        + " SET status = 'pending', claim_token = NULL"
        + " WHERE status = 'running' AND updated_at < NOW() - INTERVAL "
        + str(ttl) + " SECOND")
    for job in lost:
        if job.get("event_id"):
            try:
                fail(job["event_id"])
            except Exception:
                logger.exception("Could not fail audit event %s", job["event_id"])
    if n_jobs or n_items:
        logger.info("mass_action=reclaim jobs=%s items=%s", n_jobs, n_items)
    return n_jobs, n_items


# ─── Pull del worker ──────────────────────────────────────────────────────────

def next_batch(batch_size=None):
    """Claima el próximo lote de ítems (job running más viejo con pendientes).

    Devuelve {"idle": True} o el lote {job_id, platform, action_type,
    account_id, items: [{item_id, product_id}]}. Los jobs running sin ítems
    abiertos se cierran acá (cierre oportunista ante worker perdido a mitad
    del lote final)."""
    batch_size = int(batch_size or MASS_ACTIONS_BATCH_SIZE)
    reclaim_stale()
    dispatch_due()
    for _ in range(10):
        try:
            job = get_one(
                "SELECT * FROM " + JOBS_TABLE + " WHERE status = 'running'"
                + " ORDER BY id ASC LIMIT 1")
        except LookupError:
            return {"idle": True}
        token = uuid.uuid4().hex[:16]
        execute(
            "UPDATE " + ITEMS_TABLE
            + " SET status = 'running', claim_token = :t,"
            + "     attempts = attempts + 1, updated_at = NOW()"
            + " WHERE job_id = :j AND status = 'pending'"
            + " ORDER BY id ASC LIMIT :n",
            {"t": token, "j": job["id"], "n": batch_size})
        items = get_all(
            "SELECT id AS item_id, product_id FROM " + ITEMS_TABLE
            + " WHERE job_id = :j AND claim_token = :t AND status = 'running'"
            + " ORDER BY id ASC", {"j": job["id"], "t": token})
        if items:
            execute("UPDATE " + JOBS_TABLE
                    + " SET heartbeat_at = NOW() WHERE id = :id",
                    {"id": job["id"]})
            return {"job_id": job["id"], "platform": job["platform"],
                    "action_type": job["action_type"],
                    "account_id": job["account_id"],
                    "items": items}
        # Sin pendientes: si no quedan ítems abiertos, cerrar y seguir con el
        # próximo job; si quedan `running` (worker muerto a mitad de lote),
        # el reclaim los devolverá — no tocar el job hasta entonces.
        open_items = get_one(
            "SELECT COUNT(*) AS n FROM " + ITEMS_TABLE
            + " WHERE job_id = :j AND status IN ('pending', 'running')",
            {"j": job["id"]})["n"]
        if open_items == 0:
            _close_job(job["id"])
    return {"idle": True}


# ─── Ejecución de ítems ───────────────────────────────────────────────────────

def execute_item(item_id):
    """Ejecuta un ítem claimado. Idempotente: si el job ya no está `running`
    (cancelado/terminal) o el ítem ya no está `running`, no ejecuta nada."""
    try:
        row = get_one(
            "SELECT i.id, i.product_id, i.status AS item_status,"
            " j.id AS job_id, j.business_id, j.platform, j.action_type,"
            " j.account_id, j.status AS job_status"
            " FROM " + ITEMS_TABLE + " i"
            " JOIN " + JOBS_TABLE + " j ON j.id = i.job_id"
            " WHERE i.id = :id", {"id": item_id})
    except LookupError:
        return {"item_status": "missing", "reason": "Ítem inexistente"}

    if row["job_status"] == "cancelled":
        if row["item_status"] == "running":
            _settle_item(row, "skipped", "Ejecución cancelada por el usuario",
                         None)
        return {"item_status": "skipped"}
    if row["job_status"] != "running":
        return {"item_status": row["item_status"]}
    if row["item_status"] != "running":
        return {"item_status": row["item_status"]}  # ya ejecutado por otro lote

    payload = {
        "product_id": row["product_id"],
        "account_id": row["account_id"],
        "target": row["platform"],
        "event_type": row["action_type"],
    }
    try:
        _run_action(row["action_type"], payload)
        status, reason, external_id = _post_action_outcome(row)
    except Exception as exc:
        logger.exception("mass_action=item_failed job=%s item=%s product=%s",
                         row["job_id"], item_id, row["product_id"])
        status, reason, external_id = "failed", str(exc)[:500], None

    _settle_item(row, status, reason, external_id)
    return {"item_status": status, "reason": reason}


def _run_action(action, payload):
    if action in ("publish", "update", "pause", "delete"):
        from app.pipelines.publish import pipeline_publish
        pipeline_publish(payload)
    elif action == "link":
        from app.integrations.mercadolibre.product_handler import link_catalog
        link_catalog(payload)
    elif action == "unlink":
        from app.integrations.mercadolibre.product_handler import unlink_catalog
        unlink_catalog(payload)


def _post_action_outcome(row):
    """Resultado del ítem según lo que la fila del listing dice tras la acción
    (invariante reason/remedy: mensaje legible acá, JSON crudo en logs)."""
    action = row["action_type"]
    if row["platform"] == "mercadolibre":
        try:
            listing = get_one(
                "SELECT meli_id, status, reason FROM " + ML_LISTINGS_TABLE
                + " WHERE product_id = :p", {"p": row["product_id"]})
        except LookupError:
            listing = None
        if action == "delete":
            if listing is None:
                return "succeeded", None, None
            return _fail_or(listing, "La publicación no se eliminó")
        if action == "publish":
            if listing and listing.get("meli_id") and not _is_failed(listing):
                return "succeeded", None, listing["meli_id"]
            return _fail_or(listing, "MercadoLibre no devolvió la publicación")
        if action == "pause":
            if listing and (listing.get("status") or "") == "Paused.":
                return "succeeded", None, listing.get("meli_id")
            return _fail_or(listing, "MercadoLibre no confirmó la pausa")
        if action in ("link", "unlink"):
            if listing and not _is_failed(listing):
                return "succeeded", None, listing.get("meli_id")
            return _fail_or(listing, "MercadoLibre rechazó la acción de catálogo")
        # update
        if listing and not listing.get("meli_id"):
            return "failed", "La publicación ya no existe", None
        if listing and _is_failed(listing):
            return _fail_or(listing, None)
        return "succeeded", None, (listing or {}).get("meli_id")

    # tiendanube
    try:
        listing = get_one(
            "SELECT tnube_id, status, reason FROM " + TN_LISTINGS_TABLE
            + " WHERE product_id = :p", {"p": row["product_id"]})
    except LookupError:
        listing = None
    if action == "delete":
        if listing is None:
            return "succeeded", None, None
        return _fail_or(listing, "La publicación no se eliminó")
    if action == "publish":
        if listing and listing.get("tnube_id") and not _is_failed(listing):
            return "succeeded", None, listing["tnube_id"]
        return _fail_or(listing, "Tienda Nube no devolvió la publicación")
    if listing and not listing.get("tnube_id"):
        return "failed", "La publicación ya no existe", None
    if listing and _is_failed(listing):
        return _fail_or(listing, None)
    return "succeeded", None, listing.get("tnube_id")


def _is_failed(listing):
    return (listing.get("status") or "").startswith("Failed")


def _fail_or(listing, default_reason):
    if listing and _is_failed(listing):
        return "failed", (listing.get("reason") or listing.get("remedy")
                          or default_reason or "Error de la plataforma"), None
    return "failed", default_reason or "Error de la plataforma", None


def _settle_item(row, status, reason, external_id):
    """Persiste el resultado del ítem y actualiza los contadores del job.

    Idempotente: solo transiciona ítems que sigan en `running` (una ejecución
    doble del mismo ítem —worker duplicado o retry— no suma contadores)."""
    n = execute(
        "UPDATE " + ITEMS_TABLE
        + " SET status = :s, reason = :r, remedy = NULL, external_id = :e,"
        + "     claim_token = NULL, updated_at = NOW()"
        + " WHERE id = :id AND status = 'running'",
        {"s": status, "r": reason, "e": external_id, "id": row["id"]})
    if n == 0:
        return
    counter = {"succeeded": "succeeded", "failed": "failed", "skipped": "skipped"}.get(status)
    if counter:
        execute("UPDATE " + JOBS_TABLE + " SET " + counter + " = " + counter
                + " + 1, heartbeat_at = NOW() WHERE id = :id",
                {"id": row["job_id"]})
    cache.invalidate_business(row["business_id"])  # post-escritura (ver cache.py)
    logger.info("mass_action=item job=%s item=%s product=%s outcome=%s",
                row["job_id"], row["id"], row["product_id"], status)


# ─── Cierre / cancelación ─────────────────────────────────────────────────────

def advance_job(job_id):
    """El worker terminó su lote: heartbeat; si no quedan ítems abiertos,
    cerrar el job y liberar la cuenta (dispatch del próximo queued). Encadena
    el ticket siguiente si queda trabajo (la cadena termina sola en idle)."""
    job = _job(job_id)
    if job["status"] in JOB_TERMINAL:
        return {"continue": False}
    execute("UPDATE " + JOBS_TABLE + " SET heartbeat_at = NOW() WHERE id = :id",
            {"id": job_id})
    open_items = get_one(
        "SELECT COUNT(*) AS n FROM " + ITEMS_TABLE
        + " WHERE job_id = :j AND status IN ('pending', 'running')",
        {"j": job_id})["n"]
    if open_items:
        _kick_ticket()
        return {"continue": True}
    _close_job(job_id)
    dispatch_account(job["account_id"])
    _kick_ticket()
    return {"continue": False}


def _close_job(job_id):
    job = _job(job_id)
    if job["status"] in JOB_TERMINAL:
        return job
    status = "completed" if job["failed"] == 0 else "completed_with_errors"
    execute("UPDATE " + JOBS_TABLE
            + " SET status = :s, finished_at = NOW() WHERE id = :id"
            + " AND status = 'running'", {"s": status, "id": job_id})
    _settle_audit(job_id)
    logger.info("mass_action=closed job=%s status=%s ok=%s fail=%s skip=%s",
                job_id, status, job["succeeded"], job["failed"], job["skipped"])
    return _job(job_id)


def _settle_audit(job_id):
    """Cierra la fila de auditoría del job (finish en éxito, fail en
    falla/cancelación). Idempotente."""
    job = _job(job_id)
    if not job.get("event_id"):
        return
    try:
        if job["status"] in ("failed", "cancelled"):
            fail(job["event_id"])
        else:
            finish(job["event_id"])
    except Exception:
        logger.exception("Could not settle audit event %s", job.get("event_id"))


def delete_job(business_id, job_id):
    """Eliminar una corrida: queued → se saca de la fila; running → se aborta
    (lo ya aplicado queda; los pendientes/claimados pasan a skipped)."""
    try:
        job = get_one(
            "SELECT * FROM " + JOBS_TABLE
            + " WHERE id = :id AND business_id = :b",
            {"id": job_id, "b": business_id})
    except LookupError:
        raise LookupError("Ejecución no encontrada")
    if job["status"] == "cancelled":
        return job
    if job["status"] in ("completed", "completed_with_errors", "failed"):
        raise EligibilityError("La ejecución ya terminó, no se puede eliminar")

    was_running = job["status"] == "running"
    execute("UPDATE " + JOBS_TABLE
            + " SET status = 'cancelled', finished_at = NOW()"
            + " WHERE id = :id AND status IN ('queued', 'running')",
            {"id": job_id})
    n_skipped = execute(
        "UPDATE " + ITEMS_TABLE
        + " SET status = 'skipped', updated_at = NOW()"
        + " WHERE job_id = :j AND status = 'pending'", {"j": job_id})
    if n_skipped:
        execute("UPDATE " + JOBS_TABLE
                + " SET skipped = skipped + :n WHERE id = :id",
                {"n": n_skipped, "id": job_id})
    job = _job(job_id)
    _settle_audit(job_id)
    if was_running:
        dispatch_account(job["account_id"])
        _kick_ticket()  # el próximo job de la cuenta necesita su lote
    logger.info("mass_action=cancelled job=%s skipped=%s", job_id, n_skipped)
    return job


def _work_remaining():
    """¿Queda trabajo? (algún job queued, o running con ítems pendientes)."""
    row = get_one(
        "SELECT (SELECT COUNT(*) FROM " + JOBS_TABLE + " WHERE status = 'queued')"
        + " + (SELECT COUNT(*) FROM " + ITEMS_TABLE + " i"
        + "   JOIN " + JOBS_TABLE + " j ON j.id = i.job_id"
        + "   WHERE j.status = 'running' AND i.status = 'pending') AS n")
    return row["n"] > 0


def _kick_ticket():
    """Encadena UN ticket de lote si queda trabajo. Un ticket extra es
    inofensivo (next es global y el claim es atómico); la cadena termina sola
    cuando el worker recibe idle y no se encadena nada más."""
    if not _work_remaining():
        return False
    try:
        from app.tasks import enqueue_mass_action
        enqueue_mass_action()
        return True
    except Exception:
        logger.exception("Could not enqueue mass-action ticket")
        return False


def job_detail(business_id, job_id, failed_page=0, failed_page_size=50):
    """Job + página de ítems fallidos (para el drawer del front)."""
    try:
        job = get_one(
            "SELECT * FROM " + JOBS_TABLE
            + " WHERE id = :id AND business_id = :b",
            {"id": job_id, "b": business_id})
    except LookupError:
        raise LookupError("Ejecución no encontrada")
    failed_total = get_one(
        "SELECT COUNT(*) AS n FROM " + ITEMS_TABLE
        + " WHERE job_id = :j AND status = 'failed'", {"j": job_id})["n"]
    failed_items = get_all(
        "SELECT i.id, i.product_id, p.name AS product_name, i.reason"
        " FROM " + ITEMS_TABLE + " i"
        " LEFT JOIN inventory.products p ON p.id = i.product_id"
        " WHERE i.job_id = :j AND i.status = 'failed'"
        " ORDER BY i.id ASC LIMIT :l OFFSET :o",
        {"j": job_id, "l": int(failed_page_size), "o": int(failed_page) * int(failed_page_size)})
    job["failed_total"] = failed_total
    job["failed_items"] = failed_items
    return job
