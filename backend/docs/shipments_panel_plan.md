# Plan — Panel unificado de Envíos (MercadoLibre + TiendaNube)

Fuente de verdad para implementar el front (cuando el usuario traiga el Figma)
y para la fase de Cloud SQL (GCP). Cualquier duda de diseño que NO esté acá:
no inventar, parar y reportar.

## Contexto / problema

- ML ya tenía envíos (`mercadolibre.shipments` + webhook `shipments` + página
  `/envios/mercadolibre`). TN no tenía nada: la ruta `/envios/tiendanube` era
  ComingSoon y `order_records` descartaba el contexto de envío de la orden.
- Decisión del usuario (chat): UNA sola hoja "Envíos" unificada con filtro de
  plataforma (espejo de Ventas), eliminando el desglose ML/TN del nav.

## Doc oficial de referencia (regla "Docs primero")

- Order resource (campos planos de envío + `shipping_status`):
  https://tiendanube.github.io/api-documentation/resources/order
- Fulfillment Order (aggregate `fulfillment_orders`, por paquete):
  https://tiendanube.github.io/api-documentation/v1/resources/fulfillment-order

TiendaNube NO tiene un recurso "shipment" aparte: el envío es la orden (1:1).
Datos disponibles:
- `shipping_status`: unpacked | shipped (fulfilled) | unshipped (unfulfilled) |
  delivered | partially_packed | partially_fulfilled.
- Planos: `shipping_pickup_type` (ship|pickup), `shipping` (branch|table|
  not-provided), `shipping_option`, `shipping_tracking_number`,
  `shipping_cost_customer/owner`, `shipping_min/max_days`, `shipping_address`
  (address/number/floor/locality/city/province/zipcode/country/phone).
- Con `?aggregates=fulfillment_orders`: `fulfillments` (o
  `fulfillment_orders`) con status (UNPACKED/IN_PREPARATION/PACKED/DISPATCHED/
  READY_FOR_PICKUP/DELIVERED), carrier, option, `tracking_info{url,code}`,
  destination, labels.

## Decisiones de diseño (aprobadas por el usuario en el chat)

1. Tabla nueva `tiendanube.shipments`, 1:1 con la orden (key `(account_id,
   order_id)`). `status` guarda el estado NORMALIZADO (el crudo queda en
   `data`): el `order.status` crudo es ambiguo para una vista de envíos.
2. `data` guarda el contexto de envío completo (campos planos + `fulfillments`
   cuando el fetch pide el aggregate) — nunca el payload completo de la orden.
3. La página front la trae el usuario desde Figma. Nosotros NO construimos la
   página; solo el contrato de API (types + client + tests) en
   `frontend/src/lib/api`.
4. La columna ACCIONES es condicional por canal: ML = "Etiqueta" (PDF, ya
   existe el endpoint); TN = "Ver tracking" (link de `tracking_url`).

## 1. DB (IMPLEMENTADO local; pendiente Cloud SQL)

```sql
CREATE TABLE tiendanube.shipments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    order_id VARCHAR(255) NOT NULL,   -- la orden ES el envío
    status VARCHAR(50) NULL,          -- normalizado (ver §2)
    data JSON NULL,                   -- contexto de envío de la orden
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_shipments_account_order (account_id, order_id)
);
```

Archivos tocados: `backend/schema.sql` (CREATE, canónico Cloud SQL),
`backend/backend_tables.md` (DDL + nota con el CREATE a correr en Cloud SQL),
`backend/seed_data.sql` (sección tiendanube del dump).

## 2. Estados normalizados (filtros + strip unificados)

```
to_prepare | in_transit | delivered | not_delivered | cancelled
```

Mapeo:
- ML (desde `mercadolibre.shipments.status` crudo, CASE en SQL):
  `pending`/`handling` → `to_prepare`; `ready_to_ship`/`shipped` →
  `in_transit`; `delivered` → `delivered`; `not_delivered` → `not_delivered`;
  `cancelled` → `cancelled`.
- TN (`normalize_tn_shipment_status` en `order_records.py`, al GUARDAR):
  - `status=cancelled` → `cancelled` (la reversa SIEMPRE primero).
  - `shipping_status` ∈ unpacked/unshipped/partially_packed → `to_prepare`.
  - `shipping_status` ∈ shipped/partially_fulfilled → `in_transit`.
  - `shipping_status=delivered` → `delivered`.
  - Fallback (sin shipping_status): `closed` → delivered; `open` + tracking →
    in_transit; `open` → to_prepare. `not_delivered` NO existe en TN.

Strip: Por preparar = to_prepare; En camino = in_transit; Entregados =
delivered; Incidencias = not_delivered + cancelled.

Chip de fila (channel-aware): ML muestra el crudo + `substatus`; TN muestra el
normalizado + `raw_status` = shipping_status crudo.

## 3. Backend (IMPLEMENTADO)

- `app/integrations/core/order_records.py`:
  - `normalize_tn_shipment_status(order)`, `tn_shipment_context(order)`,
    `record_tn_shipment(account, order_id, order)` (upsert idempotente).
  - `record_order` llama `record_tn_shipment` en la rama tiendanube
    (best-effort) → el webhook de órdenes y `backfill_orders` llenan envíos
    sin cambios extra.
- `app/integrations/tiendanube/orders.py::fetch_order`: pide
  `aggregates=fulfillment_orders` con fallback sin el param ante 4xx (API
  vieja o tienda sin fulfillment): el envío igual se registra con los planos.
- Backfill dedicado: `app/integrations/core/backfill.py::backfill_tn_shipments`
  + subcomando `tn-shipments` en `scripts/backfill.py` (dry-run soportado).

## 4. API (IMPLEMENTADO) — `app/api/shipments.py`

```
GET /api/shipments?channel=all|ml|tn&status=all|to_prepare|in_transit|
  delivered|not_delivered|cancelled&q=&page=0&page_size=50
```

- `@require_auth` (empleados incluidos). Scoping SIEMPRE por `business_id`
  vía las cuentas del negocio.
- UNION ALL de `mercadolibre.shipments` (status crudo + CASE) y
  `tiendanube.shipments` (status ya normalizado) + LEFT JOIN a
  `tiendanube.orders` para los items del envío.
- `counts` (strip) NO respeta el filtro de status; `total` (paginación) SÍ.
  Ambos respetan channel y `q`. `page` 0-based; `page_size` default 50,
  máx 200.
- Item:

```json
{
  "id": "ml-4xxxxxxxx" | "tn-12345",
  "channel": "ml" | "tn",
  "shipment_id": "4xxxxxxxx" | null,
  "order_id": "...",
  "status": "in_transit",
  "raw_status": "ready_to_ship" | "shipped" | null,
  "substatus": "printed" | null,
  "tracking_number": "...",
  "tracking_url": "https://..." | null,
  "method": "cross_docking" | "Andreani a domicilio" | "",
  "pickup_type": null | "ship" | "pickup",
  "receiver": {"city": "...", "state": "...", "zip_code": "..."},
  "items": [{"title": "...", "quantity": 1}],
  "last_updated": "..."
}
```

- `tracking_url` (TN) sale de `data.fulfillments[].tracking_info.url`.
- Se MANTIENE `GET /api/mercadolibre/shipments/<external_id>/label` (etiqueta
  ML, en `channels.py`). El listado ML-only viejo
  (`/api/mercadolibre/shipments`) sigue vivo sin cambios; el front unificado
  debe consumir `/api/shipments`.

## 5. Tests (IMPLEMENTADO)

- `tests/test_tn_shipments.py`: matriz de normalización (shipping_status +
  fallback + cancelled primero), upsert/dedup, contexto (`data` con
  fulfillments), integración webhook (aggregate + fallback sin aggregate).
- `tests/test_shipments_api.py`: listado unificado ML+TN, filtros
  channel/status, q (shipment/orden/tracking), paginación y clamp, counts
  (incident = not_delivered + cancelled), auth (401/empleado OK), scoping por
  business.
- Suite completa local: 360 passed, 5 skipped.

## 6. Frontend — contrato IMPLEMENTADO; página PENDIENTE del Figma

- IMPLEMENTADO (04/10): contrato de API en `frontend/src/lib/api/` —
  `types.ts` (`ShipmentChannel`, `ShipmentStatusNorm`, `UnifiedShipment`,
  `UnifiedShipmentCounts`, `UnifiedShipmentsResponse`, `ShipmentsQuery`),
  `endpoints.ts` (`shipmentsApi.list(query)`) y test de contrato
  `shipmentsApi.test.ts` (4 tests, patrón de `salesApi.test.ts`). Mock de dev
  en `frontend/src/mock/server.ts` (`GET /api/shipments`, 9 filas mixtas
  ML+TN, mismos filtros/counts del backend — verificado end-to-end con
  `VITE_USE_MOCK=1`).
- PENDIENTE (cuando el usuario traiga el Figma): la página. Siguiendo
  SKILL_FRONT.md:
  - Ruta `/envios` unificada (eliminar `/envios/mercadolibre` /
    `/envios/tiendanube` y el grupo "Envios" del nav de `AppShell.tsx`).
  - Filtro Canal (Todos/ML/TN) + Estado (normalizado) + buscador + strip
    (counts) + tabla con badge de canal + ACCIONES condicional (ML: Etiqueta
    con `channelsApi.shipmentLabel`; TN: Ver tracking con `tracking_url`).

## 7. Fase Cloud SQL (GCP) — cuando termine TODO (incluido front)

1. Crear `tiendanube.shipments` en Cloud SQL con el CREATE de
   `backend_tables.md` (o correr `schema.sql`).
2. Backfill histórico: `scripts/backfill.py tn-shipments --platform
   tiendanube --external-account-id <store_id>` (contra Cloud SQL, DB_HOST
   vacío en `.env` de deploy).
3. `backend/scripts/check_schema_sync.py` → exit 0 (local vs Cloud SQL).

## 12. Actualización 04/10 — contrato FINAL (Figma del usuario)

El Figma del usuario definió el contrato FINAL, que reemplaza al de §2/§4/§6
(implementado y testeado, backend + front):

- **Estado POR FILA** (enumerado único ML/TN):
  `pending|handling|ready_to_ship|shipped|delivered|not_delivered|cancelled`.
  ML guarda su `status` crudo; TN mapea su `shipping_status` AL GUARDAR
  (`normalize_tn_shipment_status`): unpacked→pending, unshipped/
  partially_packed→handling, shipped/partially_fulfilled→shipped,
  delivered→delivered, cancelada→cancelled (reversa primero). TN nunca
  produce ready_to_ship ni not_delivered.
- **Grupos** (filtro `status_group` + métricas, CASE en SQL sobre el estado
  por fila): to_prepare = pending+handling; in_transit = ready_to_ship+
  shipped; delivered; not_delivered; cancelled. incidents = not_delivered +
  cancelled.
- `GET /api/shipments?channel=all|ml|tn&status_group=all|to_prepare|
  in_transit|delivered|not_delivered|cancelled&q=&page=0&page_size=50`
  → `{items, total, page, page_size,
     counts:{total,to_prepare,in_transit,delivered,incidents},
     account_total}`. `counts` NO respeta status_group; `total` SÍ; ambos
  respetan channel y q; `account_total` = sin ningún filtro (estado vacío).
- Fila: `{id: "ml-<external>"|"tn-<order>", channel, external_id (ML: envío,
  TN: orden), order_id, status (por fila), substatus (ML),
  logistic_type/mode (ML), shipping_method (TN = shipping_option),
  tracking_number, tracking_url (TN = fulfillments[].tracking_info.url),
  receiver{city,state,zip_code}, items[{id,title,quantity}], last_updated}`.
- Front (IMPLEMENTADO 04/10, port del Figma):
  - `components/ChannelBadge.tsx`: chip único (ML #FFE600/#2D3277, TN
    #2C3357/#FFFFFF, sin borde, 6px) usado en Ventas (tabla + drawer, vía
    `salesShared` re-export) y Envíos.
  - `pages/ShipmentsPage.tsx` reescrita como pantalla ÚNICA `/envios`:
    buscador con debounce 250ms, popover Filtros (Canal + Estado grupo),
    strip de 5 métricas, tabla (Envío con badge de canal, Estado chip +
    substatus ML, Destino "Ciudad, Provincia / CP", Producto "N u. · +X
    más", Método (ML: mode + tipo logístico; TN: shipping_method), Tracking
    con link ↗, Actualizado "4 oct · 10:30", Acciones condicional (ML:
    Etiqueta/Reimprimir con tooltips; TN: "Ver tracking ↗")), estados
    cargando (skeletons)/error/vacío (camión)/sin resultados ("Limpiar
    filtros"), paginación tipo Inventario. Rutas viejas
    `/envios/mercadolibre` y `/envios/tiendanube` redirigen a `/envios`;
    nav sin submenú (item único "Envios").
  - `lib/api`: `shipmentsApi.list` (query `status_group`), types del
    contrato, test de contrato actualizado. Mock de dev actualizado.
  - Se eliminó `channelsApi.mlShipments` (página ML-only deprecada);
    `channelsApi.shipmentLabel` sigue vivo para la etiqueta ML.
- Tests: backend 360 passed / 5 skipped (contrato actualizado en
  test_tn_shipments + test_shipments_api); front 33 passed + typecheck.

## 13. Fase GCP (HECHO 04/10)

- Tabla `tiendanube.shipments` creada en Cloud SQL (CREATE de §1).
- Backfill real (`backfill.py tn-shipments`): 0 órdenes — la tienda
  reconectada (8182050) no tiene órdenes en la API de TiendaNube (las
  históricas 20xxxxxx pertenecían a la encarnación anterior de la tienda y
  responden 404). El listado responde "Last page is 0" en todas las variantes
  de params.
- Alimentación con lo disponible: `scripts/seed_tn_shipments_from_orders.py`
  (one-time, idempotente) migró las 17 órdenes de `tiendanube.orders` a
  `tiendanube.shipments` derivando el estado por fila con la misma
  normalización (closed→delivered, open→pending, cancelled→cancelled);
  `data = {"migrated_from_orders": true}`. El contexto rico de envío se
  completa con el próximo webhook de cada orden (upsert).
- Verificado end-to-end contra Cloud SQL: `GET /api/shipments` → 200 con 16
  envíos del business 1 (8 ML + 8 TN), counts y filtros correctos, y scoping
  OK (las 9 filas de la cuenta TN del business 231 quedan fuera).
- `check_schema_sync.py` es MySQL-8-only (`IS_VISIBLE`): contra MariaDB
  local falla; no aplica con el docker mysql:8.4.

## 14. Corner cases cubiertos

- Re-delivery del mismo estado: upsert idempotente (no duplica fila).
- Orden cancelada con `shipping_status=unpacked`: `cancelled` (reversa primero).
- Payload viejo sin `shipping_status`: fallback closed/open+tracking.
- API TN rechaza `aggregates=fulfillment_orders`: fetch reintenta sin el param
  y el envío se registra con los campos planos.
- Orden TN sin fila en `tiendanube.orders` (JOIN): `items` vacíos, sin crashear.
- `not_delivered` solo en ML: el filtro normalizado lo soporta aunque TN nunca
  lo produzca.
- Digital orders / sin datos de envío: `normalize_tn_shipment_status` devuelve
  None → no se escribe fila.

## 15. Fuera de alcance

- Etiquetas/fulfillment de "Envío Nube" (Nuvemshop Envíos): solo aplica si la
  tienda contrata ese servicio; el MVP lee la orden y no depende de él.
- Settear tracking en TN desde el panel (endpoint de fulfill de TN): no pedido.
- Migrar el listado viejo `/api/mercadolibre/shipments` (sigue vivo; el front
  nuevo usa `/api/shipments`).
