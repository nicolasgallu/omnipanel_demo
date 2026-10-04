"""Cola de tareas para los webhooks de MercadoLibre: Cloud Tasks en prod,
stub en memoria en dev/tests.

El dispatcher de /webhooks/meli guarda la notificación en el inbox (respaldo
durable + dedup) y ENCOLA el handler pesado (fetch a Meli + upsert) para
responder 200 rápido. El worker (/internal/tasks/webhook) ejecuta la task;
Cloud Tasks reintenta ante respuestas 5xx.

Backends (env TASKS_BACKEND):
- "stub" (default, dev/tests): cola en memoria thread-safe. Los tests la
  inspeccionan con stub_pending() y la vacían con drain_stub(); en dev el
  worker se llama directo con curl (sin OIDC).
- "cloudtasks" (prod): google-cloud-tasks, HTTP task con OIDC hacia
  TASKS_WORKER_URL (la audience del token OIDC ES la URL del worker).

`enqueue` NUNCA lanza: devuelve False si el backend real falla y el caller
hace fallback inline (el evento no se pierde: el inbox ya está guardado).
"""
import json
import os
import threading

from app.settings.config import PROJECT_ID
from app.utils.logger import logger

_stub_lock = threading.Lock()
_stub_tasks = []


def is_stub():
    return (os.getenv("TASKS_BACKEND") or "stub") != "cloudtasks"


def stub_pending():
    """Snapshot de las tasks pendientes del stub (solo para tests/dev)."""
    with _stub_lock:
        return list(_stub_tasks)


def drain_stub():
    """Devuelve y vacía la cola stub (solo para tests/dev)."""
    with _stub_lock:
        out = list(_stub_tasks)
        _stub_tasks.clear()
        return out


def _task_payload(account_id, topic, notification):
    return {
        "account_id": int(account_id),
        "topic": str(topic),
        "notification": notification,
    }


def enqueue(account_id, topic, notification):
    """Encola el handler pesado de un topic. True si se encoló, False si el
    backend real falló (el caller decide el fallback inline)."""
    payload = _task_payload(account_id, topic, notification)
    if is_stub():
        with _stub_lock:
            _stub_tasks.append(payload)
        logger.info("task=enqueued backend=stub account=%s topic=%s",
                    account_id, topic)
        return True

    try:
        from google.cloud import tasks_v2  # lazy: solo prod lo necesita

        queue = os.getenv("TASKS_QUEUE") or (
            "projects/{}/locations/{}/queues/meli-webhooks".format(
                PROJECT_ID, os.getenv("TASKS_LOCATION", "us-south1")))
        worker_url = os.getenv("TASKS_WORKER_URL")
        sa_email = os.getenv("TASKS_OIDC_SERVICE_ACCOUNT")
        if not worker_url or not sa_email:
            raise RuntimeError(
                "TASKS_WORKER_URL y TASKS_OIDC_SERVICE_ACCOUNT son obligatorios"
                " con TASKS_BACKEND=cloudtasks")

        client = tasks_v2.CloudTasksClient()
        client.create_task(request={
            "parent": queue,
            "task": {
                "http_request": {
                    "http_method": tasks_v2.HttpMethod.POST,
                    "url": worker_url,
                    "oidc_token": {
                        "service_account_email": sa_email,
                        "audience": worker_url,
                    },
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps(payload).encode("utf-8"),
                },
            },
        })
        logger.info("task=enqueued backend=cloudtasks account=%s topic=%s",
                    account_id, topic)
        return True
    except Exception:
        logger.exception("Cloud Tasks enqueue failed account=%s topic=%s",
                         account_id, topic)
        return False


def enqueue_mass_action():
    """Encola un "ticket" de lote para el worker de acciones masivas.

    Modelo PUSH: cada ticket es un request HTTP a `MASS_ACTIONS_WORKER_URL`
    (el worker separado) con OIDC. El worker procesa UN lote (next → execute*
    → advance) y responde 200; Cloud Run lo escala a cero al quedar sin
    tráfico. El backend encadena el ticket siguiente cuando queda trabajo
    (engine._kick_ticket) — la cadena termina sola cuando la cola está vacía.
    El ticket NO lleva job_id: next() elige el trabajo globalmente (FIFO por
    cuenta), así un ticket perdido/duplicado es inofensivo (claim atómico).

    Backend "stub" (dev/tests): el ticket queda en memoria sin delivery; en
    dev el worker corre en modo DEV_LOOP (pull) y los tests manejan el engine
    directo.
    """
    if is_stub():
        with _stub_lock:
            _stub_tasks.append({"kind": "mass-action"})
        logger.info("task=enqueued backend=stub kind=mass-action")
        return True

    try:
        from google.cloud import tasks_v2  # lazy: solo prod lo necesita

        queue = os.getenv("MASS_ACTIONS_QUEUE") or (
            "projects/{}/locations/{}/queues/mass-actions".format(
                PROJECT_ID, os.getenv("TASKS_LOCATION", "us-south1")))
        worker_url = os.getenv("MASS_ACTIONS_WORKER_URL")
        sa_email = os.getenv("TASKS_OIDC_SERVICE_ACCOUNT")
        if not worker_url or not sa_email:
            raise RuntimeError(
                "MASS_ACTIONS_WORKER_URL y TASKS_OIDC_SERVICE_ACCOUNT son"
                " obligatorios con TASKS_BACKEND=cloudtasks")

        client = tasks_v2.CloudTasksClient()
        client.create_task(request={
            "parent": queue,
            "task": {
                "http_request": {
                    "http_method": tasks_v2.HttpMethod.POST,
                    "url": worker_url,
                    "oidc_token": {
                        "service_account_email": sa_email,
                        "audience": worker_url,
                    },
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"kind": "mass-action"}).encode("utf-8"),
                },
            },
        })
        logger.info("task=enqueued backend=cloudtasks kind=mass-action")
        return True
    except Exception:
        logger.exception("Cloud Tasks enqueue failed (mass action)")
        return False
