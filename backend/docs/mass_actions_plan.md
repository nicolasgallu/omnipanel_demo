# Plan — Acciones Masivas (publish / pause / update / delete / catálogo en lote)

> Estado: **backend + DB + FRONT IMPLEMENTADOS (04/10, Figma v184)** · GCP
> PENDIENTE (crear schema en Cloud SQL, deploy del worker, cola Cloud Tasks).
> Este documento es el contrato final de diseño, validado con el usuario.

---

## 1. Concepto (lo que ve el usuario)

Selección de productos (checkboxes + "seleccionar todas las de este filtro")
en las tres vistas de inventario (panel de productos, MercadoLibre y Tienda
Nube — el cartel es IDÉNTICO en las tres). Al seleccionar aparece el menú de
acciones con contadores **en vivo por plataforma** ("N ready to run"):

```
Publicar        — MercadoLibre 50 · Tienda Nube 30
Actualizar      — MercadoLibre 100 · Tienda Nube 120
Pausar          — MercadoLibre 10           (TN no tiene pausa)
Borrar          — MercadoLibre 30 · Tienda Nube 20
Vincular a catálogo    — MercadoLibre 30
Desvincular de catálogo — MercadoLibre 70
```

- **N ready** = elegible (reglas locales) Y que la acción CAMBIE su estado
  (publish no cuenta los ya publicados; pause no cuenta los ya pausados).
  Solo estado local: cosas como "GTIN inválido" o "Meli rechazó la foto" no
  se pueden saber sin llamar a la API → aparecen como **errores por producto**
  en la corrida, no en el contador.
- Click en la acción → modal de confirmación con checkboxes por plataforma
  (ambas por defecto) + confirmación extra ROJA para borrar.
- **Un job = una cuenta.** "Publicar en ML y TN" crea DOS corridas (una por
  plataforma), cada una con su propio FIFO. ML y TN nunca se bloquean entre
  sí (rate limits separados).
- Nueva subpágina **"Ejecuciones"** dentro del grupo Inventario (junto a
  MercadoLibre / Tienda Nube): tabla de corridas (fecha, usuario, plataforma,
  acción, progreso, estado) + drawer de detalle con contadores y errores por
  producto + **Borrar** (saca de la fila si está esperando; aborta si corre —
  lo ya aplicado queda, no es un undo).
- Estados: `En cola` (con posición en la fila) → `Ejecutando` → `Completada` /
  `Completada con errores` / `Fallida` / `Cancelada`.

## 2. Decisiones de diseño (aprobadas en el chat)

1. **Un job por cuenta.** FIFO por cuenta (dispatch atómico, UN running por
   cuenta); cuentas distintas corren en paralelo. Sin reordenar la fila.
2. **Snapshot al crear.** Los elegibles se congelan en `job_items`; el filtro
   no se re-evalúa en vivo.
3. **Éxito parcial es lo normal.** `completed` (0 errores) vs
   `completed_with_errors` (≥1). `failed` = el job no pudo arrancar / worker
   perdido. `reason`/`remedy` legibles por ítem (JSON crudo al log).
4. **Exclusión por lease, no "running bloquea".** heartbeat en cada lote;
   reclaim oportunista (>600s sin heartbeat → `failed`, ítems `running`
   viejos → `pending`). El usuario siempre puede **borrar** (abortar).
5. **Worker separado (decisión del usuario: deployable propio), modelo PUSH.**
   La carpeta `mass-actions-worker/` es autónoma (Dockerfile + cloudbuild.yaml
   + README, patrón `load-tests/`): orquestador DELGADO. El backend encola
   **un ticket por lote** en Cloud Tasks (cola dedicada `mass-actions`); el
   ticket es un `POST /run` al worker (OIDC), que procesa UN lote
   (next → execute* → advance) y responde 200 — Cloud Run lo escala a **cero**
   al quedar sin tráfico. El backend encadena el ticket siguiente mientras
   quede trabajo (`engine._kick_ticket`); la cadena termina sola en idle.
   Sin loop, sin idle, sin polling. Un ticket perdido/duplicado es inofensivo
   (next es global y el claim es atómico); Cloud Tasks reintenta ante 500.
   Toda la lógica vive en el backend (`backend/app/jobs/`) para no duplicar
   el pipeline (riesgo de drift).
6. **Componer, no reinventar.** El ítem ejecuta el MISMO `pipeline_publish`
   que el botón individual (más `link_catalog`/`unlink_catalog` nuevos en
   product_handler). La masiva se comporta igual que la individual.
7. **Eliminar = borrar** (no hay "stop"): queued → fuera de la fila; running →
   aborto (pending → skipped; los ya aplicados quedan).
8. **Progreso por polling** (`GET /api/mass-actions/<id>`), contadores del
   servidor, jamás un % estimado por el cliente.

## 3. Reglas de eligibilidad (estado local SOLO)

| acción | MercadoLibre | Tienda Nube |
|---|---|---|
| publish | sin publicar, pre-publicada o fallida + precio>0 + fotos>0 + categoría + settings completos (misma validación `_missing_required_attributes` del publish individual) | sin publicar, pre-publicada o fallida + precio>0 |
| update | publicada o pausada | publicada o pausada |
| pause | publicada | — (no existe) |
| delete | publicada, pausada o pre-publicada | publicada, pausada o pre-publicada |
| link | publicada o pausada, sin catálogo, con GTIN (la ficha se resuelve por GTIN) | — |
| unlink | publicada o pausada, en catálogo y CON sombra tradicional a la que volver | — |

La MISMA función (`app/jobs/eligibility.py`) alimenta el contador del cartel
(`eligibility_counts`) y el snapshot del job (`eligible_product_ids`): el
número que se ve es el número que corre.

## 4. Schema (implementado)

`mass_actions.jobs` + `mass_actions.job_items` — ver `backend_tables.md`
(§SCHEMA: mass_actions) y `backend/scripts/mass_actions_schema.sql`
(idempotente). `check_schema_sync.py` compara también este schema.

## 5. Backend (implementado)

- `backend/app/jobs/eligibility.py` — reglas + contadores.
- `backend/app/jobs/engine.py` — create/claim (`next_batch` con claim_token)/
  execute/advance/close/dispatch FIFO/delete/reclaim + `_kick_ticket`
  (encadenado de tickets).
- `backend/app/tasks.py` — `enqueue_mass_action()`: ticket a la cola
  `mass-actions` con OIDC hacia `MASS_ACTIONS_WORKER_URL` (stub en dev/tests).
- `backend/app/jobs/api.py` — API pública del front.
- `backend/app/jobs/internal.py` — endpoints del worker (Bearer compartido
  `MASS_ACTIONS_INTERNAL_TOKEN`; vacío = sin auth dev/tests).
- `backend/app/integrations/mercadolibre/product_handler.py` — nuevos
  `link_catalog` (ficha por GTIN, primera activa) y `unlink_catalog` (cierra
  catálogo → reactiva sombra → swap), para la variante masiva.
- `main.py` registra ambos blueprints; `config.py`/`.env` suman
  `SCHEMA_MASS_ACTIONS`, `MASS_ACTIONS_INTERNAL_TOKEN`,
  `MASS_ACTIONS_BATCH_SIZE` (25), `MASS_ACTIONS_RECLAIM_SECONDS` (600).

## 6. API pública (`/api/mass-actions/*`, @require_auth — empleados incluidos)

| método | qué hace |
|---|---|
| `POST /eligibility` | `{product_ids}` (la cuenta se resuelve sola por negocio) → `{products, publish:{ml,tn}, update:{...}, pause:{...}, delete:{...}, link:{...}, unlink:{...}}` |
| `POST ""` | `{action, channel:"ml"|"tn", product_ids}` → UNA corrida por llamada (el front llama una vez por plataforma elegida) → `202 {run: MassRun}`; nada elegible → `400 nothing_to_run` |
| `GET ""` | historial `MassRun` (filtros channel/status, page 0-based, `queue_position` cuando queued, `user` = actor por JOIN businesses/employees) |
| `GET /<id>` | MassRun + `failures[{product, reason}]` paginados (el drawer del front) |
| `DELETE /<id>` | queued → cancelada (fuera de la fila); running → abortada (pending → skipped); terminal con resultado → `409` |

`MassRun` (contrato del front): `{id, created_at, user, channel:"ml"|"tn",
action:"publish"|"update"|"pause"|"delete"|"link"|"unlink", total, ok, errors,
skipped, status:"queued"|"running"|"done"|"done_errors"|"failed"|"cancelled",
queue_position: number|null, failures?}` — la API mapea los estados internos
(`completed`→`done`, `completed_with_errors`→`done_errors`) y los canales
(`mercadolibre`→`ml`).

Scoping: business_id en cada query; cuenta resuelta por negocio, productos por
ownership estricto (ids ajenos → `400`). Una fila de auditoría
(`platform_accounts.events`, `source=dashboard`, actor real) por job.

## 7. Protocolo interno (worker → servicio)

```
Cloud Tasks ticket → POST {WORKER}/run  (OIDC, audience = URL del worker)
  worker → POST /internal/mass-actions/next            → lote claimado o idle
  worker → POST /internal/mass-actions/items/<id>/execute (por ítem, idempotente)
  worker → POST /internal/mass-actions/advance {job_id}  → heartbeat / cierre /
         dispatch + ENCADENA el ticket siguiente si queda trabajo
```

Auth worker→servicio: `Authorization: Bearer <MASS_ACTIONS_INTERNAL_TOKEN>`
(hmac.compare_digest). El worker nunca toca la DB ni el pipeline: solo ids.
Resultado por ítem según la fila del listing post-acción (estados `Paused.`/
`Updated.`/`Failed …`, fila eliminada, etc. — mismos estados que el botón
individual escribe).

## 8. Retry / rate limiting por acción

| acción | método Meli/TN | retry |
|---|---|---|
| pause / update / delete | PUT (idempotente) | `_meli_request` reintenta 429/5xx con backoff |
| publish | **POST** /items | **no se reintenta a ciegas** (evita duplicar); el ítem queda `failed` con motivo |
| link_catalog | POST catalog_listings | no se reintenta (mismo criterio) |

Pacing: un job procesa secuencialmente sus lotes; FIFO por cuenta es la
defensa contra rate limits; tickets concurrentes (eventos sobre cuentas
distintas) agregan paralelismo — el claim atómico los mantiene seguros.

## 9. Worker separado (`mass-actions-worker/`)

Flask + gunicorn: `POST /run` procesa UN lote por ticket (OIDC verificado con
audience = `MASS_ACTIONS_WORKER_URL`), `GET /healthz` para Cloud Run. Deploy:
Cloud Run SERVICE **scale-to-zero** (`--no-allow-unauthenticated`, sin
min-instances: el push lo despierta), `--timeout=300`, token interno por
Secret Manager, cola `mass-actions` en Cloud Tasks + `roles/run.invoker` al
service account. Dev local: `DEV_LOOP=1` (pull con el mismo
`process_one_batch`). Build: `cloudbuild.yaml` (el usuario crea registry +
trigger, como en load-tests). Ver README de la carpeta.

## 10. Tests

**Backend** — `backend/tests/test_mass_actions.py` (15 tests): reglas de
eligibilidad ML/TN, snapshot solo-elegibles, FIFO (uno por cuenta +
paralelismo entre cuentas), claim idempotente, execute ok/error + contadores +
auditoría, delete queued/running (abort idempotente), reclaim (job + ítems
viejos), API (eligibilidad ml/tn, create 202/400, list/detail/delete, scoping
por negocio, empleado permitido), auth interna (401 sin token) y
**encadenado de tickets** (create → ticket, cada advance → ticket siguiente,
la cadena termina en idle). Suite completa: **377 passed, 5 skipped** (04/10).
El protocolo del worker se verificó contra un mock del servicio
(next→execute×N→advance).

**Front** — port del Figma v184: `features/massActions/{shared,SelectBox,
MassActionsBar}.tsx`, `pages/EjecucionesPage.tsx` (tabla + RunPill + drawer +
polling 2s), selección persistente + barra en `InventoryPage` y
`ChannelListingsPage`, nav Inventario → Ejecuciones (ícono nuevo), animación
`massDrop` en `index.css`, `massActionsApi` + tipos + contrato de tests
(`massActionsApi.test.ts`, 6 tests) + mock de dev. Suite front: **39 passed**,
typecheck y build verdes (04/10).

## 11. Pendientes (fuera de esta etapa)

- **GCP**: crear `mass_actions` en Cloud SQL (`scripts/mass_actions_schema.sql`
  es idempotente); deploy del worker (registry + trigger + Cloud Run
  scale-to-zero); crear la cola `mass-actions` en Cloud Tasks + `run.invoker`;
  setear `MASS_ACTIONS_INTERNAL_TOKEN` y `MASS_ACTIONS_WORKER_URL`/`QUEUE`
  en ambos servicios.
- **Retención**: cleanup de corridas viejas (`job_items` crece) — tarea
  futura, no bloquea.
- **Link masivo a catálogo**: resuelve ficha por GTIN (primera activa). Si el
  usuario quiere elegir ficha por producto, es otra fase (el botón individual
  ya lo hace).

## 12. Fuera de alcance

Jobs multi-cuenta (un job = una cuenta) · reorden de la fila · push en tiempo
real (polling) · reintento automático de POST · fila de auditoría por ítem
(una por job; el detalle vive en `job_items`).
