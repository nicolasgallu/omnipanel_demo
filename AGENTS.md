# AGENTS.md — Omnipanel

Plataforma multi-canal: inventario interno → publicaciones en **MercadoLibre** y
**Tienda Nube**, sync de stock/ventas hacia **Bitcram**. Backend Flask
(`backend/`) + front React/Vite (`frontend/`). DB MySQL en Cloud SQL (GCP),
imágenes en GCS (`pictures_ecommerce_guiaslocales`). Este archivo es la guía
para trabajar en el repo: leelo antes de tocar código. El código es la fuente
de verdad; acá solo viven reglas estables, punteros y pendientes.

## Mapa rápido

- `backend/main.py` — registra webhooks + REST API. `backend/app/` — backend completo.
- **Front**: `SKILL_FRONT.md` — protocolo obligatorio antes de tocar `frontend/src`:
  primero el "Concepto de Front" en el chat (interacción, estados, escenarios),
  aprobación del usuario, recién después código.
- Dev local: `./run.sh` (un comando, docker compose: `mysql:8.4` con seed de datos
  reales en `backend/seed_data.sql` + backend gunicorn :8080 + frontend nginx :5173).
  `./run-native.sh` = sin docker. La DB la elige `DB_HOST` en `backend/.env`
  (seteado → MySQL local; vacío → connector Cloud SQL). Re-seed:
  `docker compose down -v && ./run.sh`. Regenerar el dump: `backend/scripts/export_seed.sh`.
- Webhooks (HMAC, no tocar su contrato):
  - `backend/app/api/publish_event.py` → `/webhooks/publications` (prepublish/publish/update/pause/delete para ML y TN, firmado con `webhook_secret` del business). **DEPRECADO en prueba (28/09)** — ver Pendientes.
  - `backend/app/api/images_event.py` → `/webhooks/images` (PNG base64 → GCS → DB). **DEPRECADO en prueba (28/09)** — ver Pendientes.
  - `backend/app/webhook/meli_dispatcher.py` → `/webhooks/meli` (una URL para todos los topics de Meli: inbox en `events` + ruteo por `topic` vía `registry.py`). El inbox SIEMPRE queda inline (antes del 200); los handlers pesados del registry se encolan vía `backend/app/tasks.py` (Cloud Tasks en prod, stub en memoria en dev/tests). `orders_v2` y `items` siguen inline.
  - `backend/app/webhook/task_worker.py` → `/internal/tasks/webhook` (worker de Cloud Tasks: OIDC en prod, corre el handler del topic; 200 ok / 500 reintento). Guía de setup: `backend/docs/cloud_tasks_setup.md`.
  - `backend/app/webhook/registry.py` → `{platform: {topic: handler}}` (nuevo platform = nuevo módulo + una entrada).
  - `backend/app/webhook/topics/` → handlers fetch+upsert (messages, price_suggestions, shipments, promotions, claims, payments, invoices) hacia tablas planas `mercadolibre.*`.
  - `backend/app/webhook/item_event.py` → sync de status de items (topic `items`).
  - `backend/app/webhook/selling_event.py` → `/webhooks/sells` (orders_v2 de Meli + Tiendanube).
- REST API del front (auth por token itsdangerous):
  - `backend/app/api/auth.py` + `auth_utils.py` (login, token, `require_auth`, `require_business`).
  - `backend/app/api/inventory.py`, `channels.py` (publicaciones ML/TN), `ai.py`, `admin.py` (empleados, prompts, settings, selling-costs).
  - `backend/app/api/oauth.py` → `GET /api/oauth/callback` (OAuth de ML/TN: plataforma por `Referer`, match de cuenta por user_id del code (ML) o hostname vs `credentials.url` (TN), intercambia code por tokens con client_id/client_secret de la fila credentials; no crea cuentas, no usa token de usuario).
  - `backend/app/api/support.py` → `/api/support/tickets` (tickets de soporte en `platform_accounts.support_tickets`, scoped por business_id).
  - `backend/app/api/platform_admin.py` → `/api/platform/*` (**panel de plataforma**, admins de `platform_accounts.admins` con token salt propio): login, businesses (listar/crear/activar-desactivar) y cuentas por business (crea el par accounts+credentials en una transacción). El OAuth callback existente completa la cuenta pendiente.
- Pipelines: `backend/app/pipelines/publish.py` (publicaciones), `backend/app/pipelines/sells.py` (órdenes → stock).
- Integraciones: `backend/app/integrations/{mercadolibre,tiendanube,bitcram,core}`.
- Front: `frontend/` (React/Vite; src/lib, src/pages, src/features, src/mock).
- Esquema DB: `backend/backend_tables.md` (actualizarlo SIEMPRE que cambie el schema).

## Invariantes (no romper)

1. **Dedup de eventos**: clave única `(account_id, source, event_type, external_id)`.
   NUNCA agregar campos a esa clave; el actor se guarda aparte (`actor_id`,
   `actor_role`). `external_id` estable = idempotencia de re-deliveries.
2. **Scoping por business**: toda consulta/acción filtra por `business_id`.
   Nunca confiar en el id que manda el front; validar ownership (ver
   `_owned_product` / `_owned_account`).
3. **Actores en `events`**: webhooks validan con `resolve_actor` (business o
   employee activo del mismo business; default = business). Eventos de sistema
   (orders, item status) = NULL. Acciones del dashboard van con `source="dashboard"`.
4. **Webhooks = HMAC por business** (header `X-Signature`, secret de
   `platform_accounts.businesses`). Los webhooks NO usan tokens de usuario.
5. **Roles**: Ventas / Usuarios / Configuración son SOLO `business`. Backend:
   `@require_auth` + `@require_business` (403 a empleados). Front:
   `usePermissions()` + `<RequireBusiness>` + `businessOnly` en el NAV.
   Empleados conservan: inventario, publicación, imágenes, IA, `/api/accounts`.
6. **`reason`/`remedy` espejan la realidad**: NULL en éxito, mensaje legible en
   error (el JSON crudo va al log, no al campo). `status` de listing lo
   sincroniza el webhook de items (no inventar estados).
7. **Sells**: máquina de estados paid/cancelled, `GET_LOCK` por orden,
   AUTOCOMMIT (el POST a Bitcram es externo, no se puede rollbackear).
   `stock_movements.status`: `attempting → posted | failed | failed_ambiguous`.
   `failed_ambiguous` = solo intervención manual (evitar doble posteo).
8. **HTTP a Meli**: usar `_meli_request` (product_handler): GET/PUT reintentan
   429/5xx con backoff; POST no se reintenta (crear duplicado). Publicar jamás
   se reintenta a ciegas.

## Convenciones

- **Simplicidad**: sin sobre-ingeniería. Patrones existentes del repo antes que
  frameworks nuevos. Cambios chicos y legibles.
- **Mensajes al usuario en español**, forma `{"error": "<code>", "message": "<texto>"}`.
- **Logs**: cada línea lleva `[event=N]` (correlación). Los entrypoints de
  webhooks hacen `set_event_id(None)` al inicio y `set_event_id(event_id)`
  tras el claim. Usar `logger.exception` en fallos.
- **Payload interno** (publications/images): `{id: uuid, source: "internal",
  target, account_id, event_type, product_id, actor_role?, actor_id?}`.
- **Tests**: `cd backend && .venv/bin/pytest tests/`
  (92 tests, self-provisioning: andan sobre cualquier DB vacía; fixtures
  scratch_business/employee/product con auto-cleanup). Corren contra el MySQL
  LOCAL (`DB_HOST` en `.env`), rápido — no usan Cloud SQL. NUNCA disparar
  WhatsApp real en tests (stub de `enviar_mensaje_whapi`). Todo verde (27/09/2026).

## Pendientes conocidos

- **IMPLEMENTADO 29/09 — Panel de plataforma**: tabla `platform_accounts.admins`
  (token salt propio `omnipanel-admin-auth-v1`, `require_admin`) + endpoints
  `/api/platform/*` (login, businesses listar/crear/activar-desactivar,
  cuentas por business con alta transaccional accounts+credentials). Schema:
  `businesses.active` (desactivación estricta: login bloqueado, tokens de
  business/employee mueren al instante vía chequeo por request en
  `require_auth`, webhooks internos 403 y notificaciones de Meli ignoradas),
  `accounts.external_account_id` ahora NULLable (cuenta "pendiente de OAuth").
  Admin seed: admin@guiaslocales.com (password entregada al usuario, cambiable
  con `PATCH /api/platform/password`). Pendiente: el front del panel (lo
  desarrolla el usuario aparte con el contrato de /api/platform).
- **DEPRECADO 28/09 (en prueba, completo)**: los dos webhooks internos
  `/webhooks/publications` (todos los event types: prepublish/publish/update/
  pause/delete ML+TN) y `/webhooks/images` (create/delete), más las ramas
  webhook-only del pipeline (`meli_pictures` → `ai_images.py`,
  `create_template`/`create_size_grid` → `grid_size.py`). Reemplazados por la
  REST API del dashboard: IA en `POST /api/inventory/products/{id}/prepublish`,
  settings de categoría en `POST /api/mercadolibre/configure`, acciones
  publish/update/pause/delete en `channels.py` (llama `pipeline_publish`
  directo — **esas ramas NO se deprecan**), fotos en
  `POST /api/mercadolibre/pictures` e imágenes en `/api/inventory/products/{id}/images`.
  Todo el código viejo sigue funcional y loguea un warning `DEPRECATED` si se
  invoca; el usuario lo testea en la app y, si todo OK, se elimina. Incluye la
  columna `mercadolibre.attributes.category_options` (solo la leen `prepublish`
  y `create_template`): se dropea en la misma pasada que elimine esos flujos,
  nunca antes (el código viejo aún escribe en ella).
- **RESUELTO 28/09**: delete de ML robusto ante moderación de Meli — hace GET
  del item primero (404 → limpia la fila), saltea el PUT `closed` si ya está
  `closed`/`inactive`, y trata `item.status.not_modifiable` como "ya cerrado"
  en vez de quedar en 'Failed to Delete.' para siempre. Además: pause/update
  sincronizan el estado REAL de Meli al instante (misma lógica que el webhook
  de items) y la respuesta de las acciones incluye `meli_status` + `sub_status`
  para que el front avise cuando el item está `under_review` ("el cambio de
  estado se aplicará cuando termine la revisión").
- **RESUELTO 28/09 (moderaciones)**: el sync de items consulta la moderación
  oficial de Meli (`GET /moderations/last_moderation/{item_id}-ITM`) cuando el
  estado es `under_review`/`paused` y guarda `reason` = REASON y
  `remedy` = REMEDY legibles de Meli (JSON crudo al log). El drawer ML muestra
  la "Sugerencia de MercadoLibre" en la vista Pre-publicado. Con esto el
  usuario ve exactamente qué corregir (ej. "Corrige tus fotos: no cumple el
  tamaño mínimo, posición y proporción del producto.").
- **RESUELTO 27/09**: TN orders fetch_order (`.get("access_token")` + guard),
  `insert_and_get_id` con `lastrowid` (misma conexión) en tnube
  `_insert_record` + `inventory.upload_image`, 401 intencional para account
  desconocido (documentado en el test), guard de `calculate_cost` tras publish
  fallido, errores claros de "missing access token" en meli orders/delete/
  item_event, HTTPException handler (404 real en /api), dashboard events con
  finish/fail según resultado del pipeline.
- **Webhooks de eventos Meli — IMPLEMENTADO** (inbox en `events` +
  proyecciones `mercadolibre.*` + registry). Pendiente del usuario: suscribir
  los topics en DevCenter (`messages`, `questions`, `price_suggestion`,
  `shipments`, `public_offers`, `public_candidates`, `post_purchase`,
  `payments`, `invoices`, `catalog_item_competition_status`). Inbox: `source='mercadolibre'`,
  `event_type=topic`, `external_id=_id` (hash del body si no hay `_id`),
  insert directo `status='done'`, sin `claim()`, sin columnas nuevas.
- **OAuth callback — IMPLEMENTADO** (`GET /api/oauth/callback`): plataforma por
  `Referer`, match de cuenta (ML: user_id del code vs `external_account_id`;
  TN: hostname del Referer vs `credentials.url` normalizado), exchange de code
  por tokens (client_id/client_secret de la fila credentials). `backend/.env`
  ya setea `OAUTH_CALLBACK_URL=https://api.guiaslocales.cloud/api/oauth/callback`
  (tunnel de Cloudflare → :5173 Vite → proxy `/api` → :8080). Pendiente del
  usuario: registrar esa redirect_uri exacta en el DevCenter de ML y en Tienda
  Nube. Cuenta no matcheada = 400 + log (no crea cuentas).
- **Tokens ML vencen a las 6h**: nadie usa `refresh_token` todavía
  (`get_access_token` lee el access_token directo); falta el refresh flow.
- **CRÍTICO**: `SECRET_KEY` tiene default público (`omnipanel-dev-secret-change-me`);
  setearla en prod o cualquiera puede forjar tokens de cualquier business.
- Tiendanube: HMAC de webhook es stub (siempre True, `selling_event.py`).
- Tiendanube: `pause` es local-only (la API de TN no tiene pausa real);
  el usuario va a quitar el botón del front manualmente.
- `ai.prompts` es global (sin filtro por business); `/api/ai/generate` hardcodea
  prompts propios en vez de leer la tabla.
- Passwords de employees legacy en texto plano; hash para los nuevos.
- `heartbeat()` existe pero nadie lo llama (reclaim a los 900s puede robar
  eventos largos).
- Subida de imágenes requiere rol GCS (`storage.objectAdmin` sobre el bucket)
  en la service account del runtime.

## Cómo correr / testear

```bash
# TODO junto (recomendado): un solo comando con docker compose
./run.sh            # mysql:8.4 local (seed en 1er boot) + backend :8080 + frontend :5173
# re-seed desde cero:  docker compose down -v && ./run.sh
# refrescar el dump desde Cloud SQL:  backend/scripts/export_seed.sh

# backend a mano (sin docker): ./run-native.sh, o bien
cd backend && .venv/bin/python main.py     # :8080 (DB local si DB_HOST está en .env)

# tests (contra el MySQL LOCAL, rápido — el stack o un mysql local debe estar arriba)
cd backend && .venv/bin/pytest tests/

# front (dev, proxy /api → :8080)
cd frontend && pnpm dev         # o VITE_USE_MOCK=1 pnpm dev (sin backend)

# front tests (Vitest + Testing Library, contratos estables: roles/auth/api client)
cd frontend && pnpm test
```

Firmar un webhook de prueba: HMAC-SHA256 del body crudo con el
`webhook_secret` del business (tabla `platform_accounts.businesses`), header
`X-Signature`, body con `id` (uuid) y `source="internal"`.

## Deploy (plan, aún sin implementar)

Cloud Run único con contenedor mergeado (nginx o Flask sirviendo `frontend/dist`
+ gunicorn). Env: `SECRET_KEY` (obligatorio), vars de DB y schemas; en deploy
`DB_HOST` queda VACÍO (usa el connector de Cloud SQL vía `INSTANCE_DB`). En Cloud
Run NO hace falta `GOOGLE_APPLICATION_CREDENTIALS` (ADC del service account del
runtime, que necesita Cloud SQL Client + storage.objectAdmin). Las URLs de
webhooks (`/webhooks/*`) deben permanecer estables (Meli DevCenter y el
platform interno apuntan a ellas).
