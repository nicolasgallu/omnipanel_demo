# Cloud Tasks para los webhooks de MercadoLibre — Guía de setup

Estado: **APROBADA e IMPLEMENTADA (29/09)** — decisiones confirmadas por el
usuario: encolar los 10 topics del registry (items y orders_v2 inline),
cola `meli-webhooks` en `us-south1`, SA del runtime `omnipanel-cloudrun` para
enqueue + OIDC, y el worker responde 500 solo cuando el handler LANZA
excepción. Proyecto `nicoservertest`, región `us-south1`.

---

## 1. Por qué y qué cambia

Hoy `POST /webhooks/meli` (un solo endpoint para todos los topics de Meli) hace
**todo inline** antes de responder 200:

1. resuelve la cuenta (`get_account_owner` + chequeo de negocio activo),
2. guarda la notificación en el inbox (`store_notification`, dedup por unique key),
3. corre el handler del topic (fetch a Meli + upsert en `mercadolibre.*` y, para
   messages/questions, el pipeline de IA de respuestas).

El problema: Meli reintenta la notificación si no recibe el ack rápido, y una
ráfaga de topics con handlers lentos (fetch de 30s + pipeline de IA) hace cola
dentro del request. El objetivo: **responder 200 a Meli lo antes posible** y
mover el trabajo pesado a una cola con reintentos propios.

Qué queda **inline** (antes del 200):

- validación de cuenta + negocio activo,
- `store_notification` — el inbox es el respaldo durable y el dedup
  (exactamente-once por `(account_id, source, event_type, external_id)`).
  Sigue SIEMPRE antes de responder 200.

Qué se **encola** (handler pesado):

- los topics del `registry.py` que hacen fetch a Meli + upsert:
  `messages`, `questions`, `price_suggestion`, `catalog_item_competition_status`,
  `shipments`, `public_offers`, `public_candidates`, `post_purchase`,
  `payments`, `invoices`.

Qué queda **inline por ahora** (no se encola):

- **`orders_v2`** (`selling_event._handle_meli`): usa su propia máquina de
  estados con `claim()` + `GET_LOCK` + AUTOCOMMIT y devuelve 500 para que
  **Meli** reintente (el claim re-arma el retry). Pasarlo a Cloud Tasks
  cambiaría la semántica de reintentos y la idempotencia que ya resuelve el
  claim: no conviene sin un rediseño del flujo de sells.
- **`items`** (`item_event.process_item_notification`): es un sync barato
  (1 GET + 1 UPDATE) y su fetch falla rápido; el claim/ack actual alcanza.
  En una ráfaga muy grande también podría encolarse después, pero hoy no
  aporta.

---

## 2. Diseño implementado

- `backend/app/tasks.py`
  - `enqueue(account_id, topic, notification)` — payload de la task:
    `{"account_id": int, "topic": str, "notification": <json>}`.
  - Backend real: `google-cloud-tasks` (`CloudTasksClient.create_task`), URL
    del worker + OIDC (service account email + audience = URL del worker).
    Se agrega `google-cloud-tasks` a `requirements.txt`.
  - Backend stub (dev/tests): cola en memoria thread-safe (list + Lock) con
    `TASKS_BACKEND=stub` (default local) / `TASKS_BACKEND=cloudtasks` (prod).
    `drain_stub_tasks()` para que los tests la consuman.
  - Si `create_task` falla (GCP caído): **fallback inline** — correr el
    handler en el mismo request (el inbox ya está guardado y Meli ya fue
    ackeado; no se pierde el evento).
- `meli_dispatcher.main()` — después de `store_notification(...)`:
  - `items` → `process_item_notification` inline (igual que hoy),
  - `orders_v2` → `_handle_meli` inline (igual que hoy),
  - resto con handler en registry → `enqueue(...)` y 200.
- Worker: `POST /internal/tasks/webhook` (blueprint nuevo, registrado en
  `main.py`):
  - body = payload de la task; re-resuelve la cuenta por `account_id`
    (validando `business_id` y negocio activo — scoping, nunca confiar en el
    payload), busca el handler en el registry y lo ejecuta.
  - **200** si el handler completa; **500** si lanza excepción → Cloud Tasks
    reintenta con backoff. Los handlers actuales tragan errores de fetch
    (best-effort con inbox de respaldo); el worker solo reintenta ante
    excepciones reales.
  - Idempotencia: Cloud Tasks es at-least-once, pero los upserts de los
    handlers son idempotentes por unique key y el inbox ya dedupeó — un
    re-run es seguro.
  - **Autenticación en prod**: Cloud Tasks manda `Authorization: Bearer
    <token OIDC>` con audience = URL del worker; el worker lo valida con
    `google.auth.transport.requests` + `id_token.verify_oauth2_token`
    (audience = la URL pública del worker). En dev, `TASKS_VERIFY_AUTH=0`
    permite llamarlo directo con curl.

El contrato de `/webhooks/meli` **no cambia** (misma URL, misma respuesta 200
rápida). AGENTS.md: los webhooks no usan tokens de usuario; el worker tampoco
(usa OIDC de servicio, no tokens de negocio).

---

## 3. Setup en GCP (hacerlo una sola vez)

### 3.1 Habilitar la API

```bash
gcloud config set project nicoservertest
gcloud services enable cloudtasks.googleapis.com
```

### 3.2 Crear la cola — ✅ HECHA

> El comando se corrió el 29/09 y la cola ya existe: `us-south1/meli-webhooks`.
> Nota: la versión de gcloud del Cloud Shell NO reconoce `--max-burst-size`
> (por eso el primer intento falló); la cola quedó creada sin burst explícito.

```bash
gcloud tasks queues create meli-webhooks \
  --location=us-south1 \
  --max-dispatches-per-second=20 \
  --max-concurrent-dispatches=4 \
  --max-attempts=10 \
  --min-backoff=5s \
  --max-backoff=300s
```

Qué significa cada flag (rate/concurrency):

| Flag | Valor | Por qué |
|---|---|---|
| `max-dispatches-per-second` | 20 | Techo sostenido de tasks/s; Meli manda ráfagas cortas, no un caudal constante. |
| `max-concurrent-dispatches` | 4 | Cuántas tasks ejecuta el worker a la vez (4 requests concurrentes a Meli como máximo). |
| `max-attempts` | 10 | Reintentos totales por task antes de ir a la dead-letter. |
| `min-backoff` / `max-backoff` | 5s / 300s | Backoff exponencial entre reintentos: no martillar a Meli. |

Consola: Cloud Tasks → Create queue → Name `meli-webhooks` → Region
`us-south1` → Rate limits (mismos valores) → Retry config (mismos valores).

### 3.3 Service account para encolar — ✅ HECHA (SA del runtime)

```bash
gcloud projects add-iam-policy-binding nicoservertest \
  --member="serviceAccount:omnipanel-cloudrun@nicoservertest.iam.gserviceaccount.com" \
  --role="roles/cloudtasks.enqueuer"
```

Ya quedó aplicado (confirmado en el IAM del proyecto): la SA del runtime
`omnipanel-cloudrun` tiene `roles/cloudtasks.enqueuer`. Con la SA propia de
Cloud Run, el ADC del runtime puede firmar el token OIDC para esa misma SA
cuando Cloud Tasks ejecuta la tarea.

### 3.4 Worker: URL + autenticación OIDC

El worker vive dentro del mismo servicio Cloud Run (`omnipanel`), ruta
`/internal/tasks/webhook`. La URL pública del servicio es del tipo
`https://omnipanel-XXXX-YY.a.run.app` (se ve en la consola o con
`gcloud run services describe omnipanel --region=us-south1`).

Al crear cada task se indica:

```bash
WORKER_URL=https://omnipanel-XXXX-YY.a.run.app/internal/tasks/webhook
SA_EMAIL=omnipanel-cloudrun@nicoservertest.iam.gserviceaccount.com

gcloud tasks create-http-task \
  --queue=meli-webhooks --location=us-south1 \
  --url="$WORKER_URL" \
  --oidc-service-account-email="$SA_EMAIL" \
  --oidc-token-audience="$WORKER_URL" \
  --header=Content-Type:application/json \
  --body-content='{"account_id":1,"topic":"messages","notification":{}}'
```

- `oidc-token-audience` DEBE ser exactamente la URL pública del worker
  (Cloud Run la valida contra el servicio).
- En código (`tasks.py` con `google-cloud-tasks`) es lo mismo:
  `task["http_request"] = {"http_method": "POST", "url": WORKER_URL,
  "oidc_token": {"service_account_email": SA_EMAIL, "audience": WORKER_URL},
  "headers": {"Content-Type": "application/json"}, "body": json.dumps(payload)}`.
- Si en el futuro el dominio propio (`api.guiaslocales.cloud`) apunta
  directo al servicio de Cloud Run, usar esa URL como audience; mientras el
  túnel de Cloudflare apunte al Vite de dev, usar la URL `*.run.app` (en dev
  local el worker se llama directo por `localhost:8080`, ver §4).

Variables de entorno nuevas para Cloud Run (via `gcloud run services update
omnipanel --region=us-south1 --set-env-vars=...`):

```
TASKS_BACKEND=cloudtasks
TASKS_QUEUE=projects/nicoservertest/locations/us-south1/queues/meli-webhooks
TASKS_WORKER_URL=https://omnipanel-XXXX-YY.a.run.app/internal/tasks/webhook
TASKS_OIDC_SERVICE_ACCOUNT=omnipanel-cloudrun@nicoservertest.iam.gserviceaccount.com
TASKS_VERIFY_AUTH=1
```

---

## 4. Estrategia de test LOCAL (sin Cloud Tasks)

1. **Abstracción de enqueue**: `tasks.enqueue()` mira `TASKS_BACKEND`
   (default `stub` si no está seteada). En dev/tests nadie toca GCP:
   - `stub`: agrega la task a una lista en memoria thread-safe; el test la
     inspecciona con `tasks.stub_pending()` / `tasks.drain_stub()`.
   - `cloudtasks`: llama a la API real (solo en prod).
2. **El worker se puede llamar directo en dev** (sin OIDC, `TASKS_VERIFY_AUTH=0`):

```bash
curl -X POST http://localhost:8080/internal/tasks/webhook \
  -H 'Content-Type: application/json' \
  -d '{"account_id": 1, "topic": "messages", "notification": {"resource": "/messages/123", "user_id": 1}}'
```

3. **Tests (mockeados, sin llamadas reales a Meli — ya escritos en
   `tests/test_tasks.py`)**:
   - Dispatcher: `monkeypatch` de `tasks.enqueue` → assert que el inbox quedó
     guardado (`platform_accounts.events`, status done, external_id = _id) y
     que la task se encoló con `{account_id, topic, notification}` correctos,
     **sin** ejecutar el handler.
   - Worker: llamar `/internal/tasks/webhook` con un handler fake instalado
     en el registry (o monkeypatch del handler) → 200 en éxito; con un
     handler que lanza → 500 (para que Cloud Tasks reintente).
   - Idempotencia: dos deliveries iguales → una sola fila en inbox (unique
     key) y el upsert no duplica.
   - El stub en memoria es la única cola que ven los tests (el fixture de
     `block_real_network` de conftest sigue vigente: cualquier HTTP real
     falla el test).

---

## 5. Decisiones confirmadas (29/09)

1. ✅ Se encolan los 10 topics del registry (`messages`, `questions`,
   `price_suggestion`, `catalog_item_competition_status`, `shipments`,
   `public_offers`, `public_candidates`, `post_purchase`, `payments`,
   `invoices`); `items` y `orders_v2` quedan inline.
2. ✅ Cola `meli-webhooks` en `us-south1`: 20/s, 4 concurrentes, 10
   reintentos, backoff 5s→300s (sin `--max-burst-size`: no lo soporta el
   gcloud del usuario).
3. ✅ SA del runtime `omnipanel-cloudrun` para enqueue + OIDC.
4. ✅ El worker devuelve 500 solo cuando el handler LANZA excepción; los
   errores de fetch que los handlers tragan siguen con log + inbox como
   respaldo.

Pendiente para el deploy: setear las env de §3.4 en Cloud Run con la URL
real del servicio (`gcloud run services describe omnipanel --region=us-south1`).
