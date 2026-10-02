# Plan — Panel de Ventas: workflow de órdenes (MercadoLibre + TiendaNube)

Fuente de verdad para los subagents que implementan este plan. Cualquier duda
de diseño que NO esté acá: no inventar, parar y reportar.

## Contexto / problema

- `mercadolibre.orders.status` y `tiendanube.orders.status` guardan la máquina
  INTERNA de stock (`NULL`/`paid`/`cancelled`), no el estado real del canal.
- El estado real del canal se descarta en el webhook salvo `paid`/`cancelled`
  (`derive_event_type` devuelve `None` → "ignored").
- No existe track de estados; buyer/total/fecha solo están crudos en
  `platform_accounts.events.payload`.

## Decisiones de diseño (aprobadas por el usuario en el chat)

1. El track de estados vive EN la propia tabla `orders` de cada plataforma
   (columna JSON `status_history`, append-only, dedup por último estado).
2. El trigger del sync de stock es una config GLOBAL del business:
   `businesses.config.stock_sync.trigger = "paid" | "confirmed"` (default `paid`).
3. La página front la trae el usuario desde Figma. Nosotros NO construimos la
   página; solo el contrato de API (types + client + tests) en `frontend/src/lib/api`.
4. El panel muestra el sync de stock de forma genérica (nunca nombrar Bitcram):
   badge derivado de `stock_movements.status` + `provider_doc_id`.

## 1. Cambios de DB

Columnas nuevas en AMBAS tablas (`mercadolibre.orders` y `tiendanube.orders`):

```sql
channel_status      VARCHAR(50)   NULL,  -- estado crudo del canal
status_history      JSON          NULL,  -- track append-only (ver shape)
buyer_name          VARCHAR(255)  NULL,
buyer_external_id   VARCHAR(50)   NULL,
total               DECIMAL(12,2) NULL,
currency            VARCHAR(5)    NULL,
date_created        TIMESTAMP     NULL,  -- fecha de la orden en el canal
link                TEXT          NULL   -- url de la orden en ML/TN
```

Solo `tiendanube.orders` además:

```sql
payment_status      VARCHAR(50)   NULL   -- pending|authorized|paid|voided|refunded
```

NO cambia: `status` (máquina interna), `data` (items), `pack_id`, `created_at`,
`updated_at`, la unique key `(account_id, order_id)`.

Archivos a tocar (los 3):

- `backend/schema.sql` — los dos `CREATE TABLE ... orders` (canónico para Cloud SQL).
- `backend/backend_tables.md` — documentar las columnas nuevas en ambas tablas
  (regla de AGENTS.md: siempre actualizar al cambiar el schema) + una nota con el
  `ALTER TABLE` a correr en Cloud SQL (mismo estilo que la nota de
  `idx_business_updated`).
- `backend/seed_data.sql` — los dos `CREATE TABLE \`orders\`` del dump (líneas
  ~26878 y ~27301; verificar al editar). Es el seed del MySQL local de docker.
- Aplicar los `ALTER TABLE` al MySQL LOCAL en `127.0.0.1` (credenciales en
  `backend/.env`: `USER_DB`/`PASSWORD_DB`; ver ejemplo `SHOW COLUMNS` ya probado)
  para que los tests corran contra el schema nuevo.

## 2. Shape de `status_history`

Array de eventos, un elemento por cambio REAL de estado:

```json
[
  {"key": "confirmed", "status": "pending_payment", "raw": "confirmed",
   "payment_status": null, "at": "2026-09-27T12:01:00Z"}
]
```

- `key`: para dedup = `raw` en ML; `raw + "|" + payment_status` en TN.
- `status`: estado normalizado (abajo). `payment_status`: solo TN.
- `at`: timestamp del canal (si viene); si no, `NOW()` UTC.

Regla de append: solo si el `key` del último elemento difiere del nuevo.
Implementar con UPDATE guardado (comparar el último `key` con
`JSON_EXTRACT`) y, si no hay fila, INSERT con el array inicial. Un re-delivery
del mismo estado NO agrega elemento (idempotente).

## 3. Estados normalizados

```
pending_payment | paid | completed | cancelled
```

Mapeo:
- ML (`channel_status`): `confirmed`/`payment_required`/`payment_in_process`
  → `pending_payment`; `paid` → `paid`; `cancelled` → `cancelled`.
- TN (`channel_status` + `payment_status`):
  - `cancelled` o `payment_status` ∈ (`voided`,`refunded`) → `cancelled`
  - `closed` → `completed`
  - `open` + `paid` → `paid`
  - `open` + (`pending`/`authorized`) → `pending_payment`
- Labels: pending_payment="Pendiente de pago", paid="Pagada",
  completed="Entregada", cancelled="Cancelada".

## 4. Trigger configurable (global)

`businesses.config.stock_sync.trigger`:
- `"paid"` (default si falta o es inválido): ML venta en `status=paid`;
  TN venta en `payment_status=paid`.
- `"confirmed"`: ML venta en `status=confirmed`; TN venta en `status=open`
  (cualquier `payment_status` salvo los de reversa).

Reversa (en AMBOS modos): ML `status=cancelled`; TN `status=cancelled` o
`payment_status` ∈ (`voided`,`refunded`). La reversa se evalúa ANTES que la
venta en `derive_event_type`.

IMPORTANTE: en modo `confirmed`, una orden `confirmed → cancelled` sin pasar
por `paid` DEBE revertir (la venta ya se posteó en `confirmed`).

## 5. Cambios de backend

- La máquina de `sells.py` NO cambia de lógica (sigue leyendo `orders.status`
  como "venta hecha"/"cancelada"); solo `derive_event_type` recibe el `trigger`.
- Nuevo módulo de normalización (p. ej. `backend/app/integrations/core/order_records.py`):
  - `normalize_order(platform, order)` → dict con los campos normalizados
    (buyer/total/currency/date_created/link/items). Items normalizados:
    `{sku, title, quantity, unit_price, total}` (ML: `order_items[].item`,
    sku vía fetch de item como ya hace `order_items.py` si está; para el
    registro alcanza con lo que viene en el payload + `order_items`).
  - `normalize_status(platform, channel_status, payment_status)` → normalizado.
  - `append_status_history(existing_json, event)` → JSON nuevo (o guard SQL).
  - `record_order(account, platform, order_id, order)` → upsert de TODAS las
    columnas nuevas + `data` (items, misma lógica que `_set_status` hoy) +
    append de history. NUNCA escribe `status` (columna de la máquina).
- `backend/app/webhook/selling_event.py`:
  - Llamar `record_order(...)` para TODOS los estados (ML y TN), ANTES del
    filtro `derive_event_type`. Los estados no accionables ahora registran la
    orden y siguen respondiendo "ignored".
  - Pasar el `trigger` (leído de `businesses.config.stock_sync.trigger`,
    default `paid`) a `derive_event_type`.
- `backend/app/integrations/mercadolibre/orders.py` +
  `backend/app/integrations/tiendanube/orders.py`: `derive_event_type(order, trigger)`.
- El flujo de claim + `process_order` (stock sync) NO cambia: sigue solo para
  los eventos derivados como venta/reversa.
- Convenciones: logs con `[event=...]` (usa `set_event_id`), mensajes en
  español, `logger.exception` en fallos, sin sobre-ingeniería.

## 6. API (`backend/app/api/sales.py`, blueprint registrado en `main.py`)

Ambos endpoints: `@require_auth` + `@require_business` (Ventas es solo
business). Scoping SIEMPRE por `business_id` vía las cuentas del negocio.

```
GET /api/sales/orders?q=&channel=&status=&page=&page_size=
```
- `channel`: `ml` | `tn` (vacío = ambos). `status`: normalizado.
- `page` 1-based; `page_size` default 50, máx 200 (clamp).
- UNION de las dos tablas de órdenes del business (accounts del business,
  ambas plataformas). Ordenar por `date_created DESC` (fallback `updated_at`,
  luego `id` DESC).
- Response:
```json
{
  "items": [{
    "order_id": "43918201",
    "platform": "mercadolibre",
    "account_name": "Cuenta ML",
    "date_created": "...", "buyer_name": "...",
    "total": 54300, "currency": "ARS",
    "status": "paid",
    "items_count": 2, "first_item_title": "Remera ML",
    "sync": "synced",
    "link": "..."
  }],
  "total": 182, "page": 1, "page_size": 50,
  "summary": {"total": 182, "pending_payment": 4, "paid": 121,
              "completed": 40, "cancelled": 17}
}
```
- `summary` cubre TODA la búsqueda (no solo la página), patrón de
  `ml_shipments`.
- `status` (item) = último evento de `status_history`; si no hay, derivar de
  `channel_status`(+`payment_status` en TN).
- `sync` por orden (de `stock_movements` de ese `order_id`+`account_id`),
  precedencia: algún `failed`/`failed_ambiguous` → `error`; algún `attempting`
  → `pending`; algún `reversal` posted → `reversed`; sale posted → `synced`;
  sin filas → `none`.

```
GET /api/sales/orders/<platform>/<order_id>
```
(platform en el path porque el mismo order_id puede existir en ambos canales)
```json
{
  "order": { "...igual que un item..." },
  "timeline": [
    {"key": "confirmed", "status": "pending_payment", "label": "Pendiente de pago",
     "raw": "confirmed", "payment_status": null, "at": "..."}
  ],
  "items": [{"sku": "...", "title": "...", "quantity": 2,
             "unit_price": 16900, "total": 33800}],
  "stock_sync": {
    "state": "synced",
    "movements": [{"direction": "sale", "quantity": 2, "unit_price": 16900,
                   "status": "posted", "provider_doc_id": "2093",
                   "error_message": null, "created_at": "..."}]
  }
}
```
- 404 JSON `{"error":"not_found","message":"Orden no encontrada"}` si no
  existe o no es del business.

## 7. Frontend — SOLO contrato (la página la trae Figma)

En `frontend/src/lib/api/`:
- `types.ts`: `SalesStatus`, `OrderSyncState`, `SalesOrder` (item),
  `SalesSummary`, `SalesResponse`, `OrderTimelineEvent`, `OrderSyncMovement`,
  `SalesOrderDetail`, `SalesQuery`.
- `endpoints.ts` (+ `client.ts` si hace falta): `salesApi.list(query)` y
  `salesApi.get(platform, orderId)` siguiendo el patrón de `channelsApi`.
- Test de cliente (patrón `client.test.ts`) con contratos estables:
  URL/query params correctos.
- NO tocar páginas, App, layout ni ComingSoon (sigue `/ventas` → ComingSoon
  hasta que el usuario traiga el código de Figma).

## 8. Tests (backend) — `backend/tests/`

Convenciones: `fake_http` (HTTP real bloqueado), fixtures `meli_account`,
`tn_account`, `scratch_product`, `stock_sync_none`, `clean_rows`/`clean_events`,
`client` de Flask. Patrón de `test_sells.py` / `test_tn_orders.py`.

Unitarios (nuevo archivo, p. ej. `test_order_records.py`):
- `derive_event_type(order, trigger)`: matriz completa ML/TN (ver §4).
- `normalize_status` / `normalize_order`: mapeos + buyer ausente (invitado).
- `append_status_history`: dedup por `key`, creación desde NULL, TN usa
  `raw|payment_status` como key.

Integración webhook (extender `test_sells.py` / `test_tn_orders.py`):
- `confirmed` con trigger=paid: crea fila con `channel_status='confirmed'` +
  1 evento en history + CERO `stock_movements`.
- Secuencia `confirmed → payment_required → paid` (trigger=paid): history con
  3 eventos, `channel_status='paid'`, sale posteada UNA vez.
- Re-delivery del mismo estado: history NO crece, movimientos NO se duplican.
- trigger=confirmed (ML): `confirmed` postea sale; luego `cancelled` (sin
  pagar nunca) postea reversal.
- trigger=confirmed (TN): `open+pending` postea sale; `refunded` revierte.
- Independencia de columnas: tras `paid → cancelled`, `status`=cancelled
  (máquina), `channel_status`=cancelled (canal) y history conserva ambos.
- Config: sin `trigger` → comportamiento `paid` (backward-compat); trigger
  inválido → fallback `paid`.

API (nuevo `test_sales_api.py`):
- Listado unificado ML+TN, filtros `channel`/`status`, `q`, paginación y
  clamp, `summary` correcto sobre la búsqueda completa.
- Detalle: timeline + items + stock_sync con `provider_doc_id`; 404 para
  order_id ajeno; el mismo order_id en ML y TN se resuelve por `platform`.
- Empleado → 403; business B no ve órdenes del business A (scratch_business).

Fixtures nuevos en `conftest.py`:
- `stock_sync_trigger(trigger)`: setea/restaura `businesses.config.stock_sync.trigger`.
- Helpers de payloads de ejemplo (ML y TN) con buyer/total/fecha/items.

## 9. Corner cases a explorar/cubrir (pueden explotar en prod)

1. Re-delivery del mismo estado: no duplica history ni movimientos.
2. `confirmed → cancelled` en trigger=confirmed: revierte y sale UNA sola vez.
3. `paid` que llega después de una sale-en-`confirmed`: no duplica venta.
4. Cambio de trigger ENTRE webhooks (ej. `confirmed` llegó con trigger=paid
   [no vende]; el usuario cambia a `confirmed` y llega `paid` → vende).
   Comportamiento esperado: el trigger se evalúa en cada evento; documentarlo
   en un test.
5. TN `refunded` sin venta previa (trigger=paid): NO crea reversal fantasma
   (máquina actual ya lo evita; fijarlo con test).
6. Comprador invitado ML (sin `buyer`): `buyer_name` NULL, el panel muestra "—".
7. `order_items` vacío o sin `item.id`: `record_order` no rompe (items vacíos).
8. `status_history` NULL → primer append crea el array.
9. Timestamps: `date_created` ausente → la COLUMNA queda NULL y el evento del
   timeline usa `NOW()` como `at`; la API ordena con fallback
   `COALESCE(date_created, updated_at, created_at)`. Serialización ISO en la API.
10. `total`/`currency` ausentes → NULL, sin crashear.
11. Account sin token → error claro (ya cubierto; verificar no regresión).
12. `paid` y `cancelled` concurrentes: GET_LOCK (ya existe) + upserts
    idempotentes de `record_order` convergen (documentar).
13. Paginación borde: `page=0`, `page_size>200` → clamp; página vacía → items=[].
14. Búsqueda `q` por order_id y por buyer.
15. Órdenes de TN sin fila de movements: `sync="none"`.
16. History no crece sin límite: dedup evita crecimiento por re-deliveries.

## 10. Verificación final

- `cd backend && .venv/bin/pytest tests/` → TODO verde (suite completa, 283+
  tests existentes no deben romperse).
- `cd frontend && pnpm test` → verde.
- NO hay git en el workspace: reportar los archivos cambiados explícitamente.

## 11. Fuera de alcance (no tocar)

- Envíos/`mercadolibre.shipments` (ya tiene su página).
- Tabla `platform_accounts.events` y su clave de dedup (invariante).
- Migrar datos históricos de órdenes existentes (las viejas quedan sin
  history hasta el próximo webhook).

## 12. Actualización 02/10 — contrato final (Figma del usuario)

El summary del usuario + el código de Figma definieron el contrato FINAL, que
reemplaza al de §6/§7 (implementado y testeado):

- `GET /api/sales/orders?channel=all|ml|tn&status=all|pending_payment|paid|delivered|cancelled&q=&page=0&page_size=50`
  → `{items, total, page, page_size, counts:{total,pending_payment,paid,delivered,cancelled}}`.
  `page` 0-based; `counts` (métricas) NO respeta el filtro de status; `total`
  (paginación) SÍ.
- Estado normalizado: `completed` se renombró a **`delivered`**.
- Sync (set FINAL, sin `reverted`): `not_applicable | pending | synced | error`.
  Regla: sin movimientos → not_applicable; algún failed/failed_ambiguous →
  error; si no, algún attempting → pending; si no → synced (venta+devolución
  posteadas = inventario consistente).
- Cada item trae `stock_transactions: [{type: sale|return, status:
  synced|pending|error, document_number}]` (mapeo por SKU vía
  stock_movements+products; el comprobante solo existe en synced) y `history`
  (`at`/`status`/`raw_status`, el último es el actual) embebidos — el drawer no
  llama al endpoint de detalle.
- Reporte: `GET /api/sales/report?days=7|30|90&channel=all|ml|tn` →
  `{days:[{date,orders,net,by_channel:{ml:{orders,net},tn:{orders,net}}}],
  net, orders, orders_per_day, avg_ticket,
  cancelled:{count,amount,pct}, by_channel:{ml:{orders,net},tn:{orders,net}}}`.
  Neto = órdenes NO canceladas; la serie incluye TODOS los días del rango (los
  vacíos en 0) agrupados por fecha de creación en tz Argentina; `by_channel`
  siempre completo (modo comparar); `pct = count/(orders+count)*100`.
- `url`: ML = `https://www.mercadolibre.com.ar/ventas/{order_id}/detalle`;
  TN = `https://{credentials.url host}/admin/orders/{order_id}` (null si no hay).
- Trigger IMS: `GET /api/settings/stock-sync` devuelve `trigger` (default
  `paid`); `POST` lo preserva si no viene; nuevo
  `PATCH /api/settings/stock-sync/trigger` con `{trigger: paid|confirmed}`.
- Front: página `/ventas` real (port de figma/App.tsx) con tabs
  **Órdenes | Reportes** en `frontend/src/pages/VentasPage.tsx` +
  `features/sales/{VentasReportes,SaleDrawer,salesShared}.tsx` +
  `components/{ListingColumnManager,StatStrip}.tsx`; drawer con tarjetas por
  ítem y transacciones apiladas + leyenda; picker de trigger en
  `ImsSettings.tsx` (API real, sin localStorage).
