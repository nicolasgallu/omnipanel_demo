# Omnipanel — E-commerce multi-canal

Plataforma para gestionar inventario y publicar productos en **MercadoLibre** y
**Tienda Nube**, con sincronización de stock hacia **Bitcram**.

- **Backend**: Flask + SQLAlchemy + MySQL (Cloud SQL, GCP) — carpeta `backend/`, entrada `backend/main.py`
- **Frontend**: React + TypeScript + Vite + Tailwind v4 — carpeta `frontend/`
- **Diseño**: replica el export de Figma (`figma/App.tsx`)

---

## Arquitectura

```
frontend/ (React, puerto 5173 — dev con Vite o docker con nginx)
   │  /api/*
   ▼
Flask (puerto 8080)
   │
   ├── MySQL Cloud SQL (platform_accounts / inventory / mercadolibre / tiendanube)
   ├── MercadoLibre API (categorías, listing prices, publish/pause/update/delete)
   ├── Tienda Nube API (publish/update/delete)
   └── GCS bucket pictures_ecommerce_guiaslocales (imágenes de producto, PNG, máx 10)
```

### Endpoints REST nuevos (para el front)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login (business o empleado activo) → token |
| GET | `/api/auth/me` | Usuario actual |
| GET | `/api/inventory/products` | Listado paginado con filtros `q`, `channel`, `category`, `stock`, `ml_status`, `tn_status` + precios de canal (`ml_price`/`tn_price`) |
| GET | `/api/inventory/categories` | Categorías distintas del negocio (para el filtro) |
| GET | `/api/inventory/products/<id>` | Detalle: imágenes, variaciones, publicaciones, movimientos de stock |
| PATCH | `/api/inventory/products/<id>` | Editar título / descripción / dimensiones |
| DELETE | `/api/inventory/products/<id>` | Eliminar producto (cascada) |
| POST | `/api/inventory/products/<id>/images` | Subir imagen PNG (multipart `file`, máx 10 MB, máx 10) |
| DELETE | `/api/inventory/products/<id>/images/<img>` | Borrar imagen |
| GET | `/api/accounts` | Cuentas conectadas del negocio |
| GET | `/api/mercadolibre/categories?q=` | Domain discovery de ML |
| GET | `/api/mercadolibre/listing-prices?price=&category_id=` | Campañas + comisiones |
| GET | `/api/mercadolibre/performance?product_id=&account_id=` | Health/performance del item (`mercadolibre.performance`) |
| GET/POST | `/api/mercadolibre/settings` / `configure` | Estado del wizard de publicación |
| POST | `/api/mercadolibre/publish` `update` `pause` `delete` | Acciones sobre la publicación |
| GET | `/api/tiendanube/settings` | Config TN del producto |
| POST | `/api/tiendanube/publish` `update` `pause` `delete` | Acciones sobre el producto TN |
| POST | `/api/ai/generate` | Generar título/descripción con IA (DeepSeek) |
| GET/PUT | `/api/ai/prompts` | Leer/editar los prompts de la tabla `ai.prompts` |
| GET/POST/PATCH | `/api/employees` | Listar/crear empleados y activar/desactivar |
| PATCH | `/api/auth/password` | Cambiar la contraseña del usuario logueado |
| GET/POST | `/api/settings` (+`/logo`) | Datos del negocio y logo |
| GET | `/api/mercadolibre/selling-costs` | Costos de venta (`mercadolibre.selling_costs`) |
| POST | `/api/inventory/products/<id>/prepublish` | Completa campos faltantes con IA |
| GET | `/api/health` | Health check (sin tocar la DB) |

Los webhooks existentes (`/webhooks/*`) siguen intactos. Cada acción del
dashboard queda auditada en `platform_accounts.events` con el actor
(business/employee) igual que los eventos de webhook.

---

## Cómo correr localmente

### La forma única: `./run.sh` (Docker, DB local)

```bash
./run.sh
```

Levanta TODO con docker compose:

- **MySQL local** (`mysql:8.4`) en `localhost:3306` — en el primer arranque
  carga `backend/seed_data.sql`, un dump real de la instancia de Cloud SQL
  (schemas + datos: productos, cuentas, credenciales, negocios…).
- **Backend** (gunicorn) en `http://localhost:8080` — conecta a `mysql`
  (la DB del stack, no a GCP).
- **Frontend** (nginx) en `http://localhost:5173` — proxya `/api` al backend.

Requisitos: docker + plugin compose, `backend/service_account.json` (para GCS,
imágenes/logo) y `backend/seed_data.sql`.

```bash
# Refrescar el dump local con el estado actual de Cloud SQL:
backend/scripts/export_seed.sh

# Re-seedear el MySQL local desde cero (borra el volumen de datos):
docker compose down -v && ./run.sh

# Bajar todo / ver logs:
docker compose down
docker compose logs -f
```

Los datos viven en el volumen `mysql_data`: persisten entre corridas y solo se
resetean con `down -v`.

### Fallback sin Docker: `./run-native.sh`

Arranca backend (Flask, `backend/.venv`) y frontend (Vite) directo en tu
máquina. Usa la DB que diga `backend/.env`: con `DB_HOST=127.0.0.1` va contra
el MySQL local del stack; con `DB_HOST` vacío va contra Cloud SQL (GCP).

### Tests

Corren contra el MySQL local (rápido, no tocan GCP):

```bash
cd backend
.venv/bin/pytest tests/
```

El front, igual que siempre:

```bash
cd frontend
pnpm install

# Modo real: proxy /api → http://localhost:8080
pnpm dev

# Modo demo (sin backend ni DB): mock in-memory de toda la API
VITE_USE_MOCK=1 pnpm dev
```

En modo demo entrá con `demo@guiaslocales.com` / `demo1234`
(o `empleado@guiaslocales.com` / `demo1234`).

### Variables de entorno

Viven en `backend/.env`: `USER_DB`, `PASSWORD_DB`, `NAME_DB`, schemas,
`DB_HOST`/`DB_PORT` (modo local), `INSTANCE_DB` (modo Cloud SQL), y opcional
`SECRET_KEY` (firma de tokens), `CORS_ORIGIN` y `OAUTH_CALLBACK_URL`.

---

## Notas de implementación

- **Login**: busca primero en `platform_accounts.businesses` y después en
  `platform_accounts.employees` (solo `active=1`). Soportamos passwords
  hasheados (werkzeug: `pbkdf2:`/`scrypt:`/bcrypt) **y** passwords en texto
  plano (legacy) para no romper datos existentes.
- **Imágenes**: el backend solo acepta PNG (igual que el webhook de imágenes
  existente). El front convierte cualquier imagen a PNG en el navegador antes
  de subirla.
- **Estados de publicación**: el backend mapea los estados de la DB
  (`active`, `Paused.`, `Failed to Publish.`, `Published`, …) a los estados
  del diseño (`published`, `paused`, `prepublished`, `failed`, `unpublished`).
- **Pausar en Tienda Nube**: la API de Tienda Nube no tiene pausa real, así
  que `/api/tiendanube/pause` marca la publicación como pausada solo
  localmente; la reactivación sincroniza vía `update`.
- **Performance ML**: el panel lee `mercadolibre.performance` (score, nivel,
  buckets). Si el item todavía no tiene datos, la sección no se muestra.
- **Wizard ML**: `Categoría` usa el domain discovery real de ML;
  `Configurar` construye los atributos requeridos de la categoría
  (`_settings_builder`) y el picker de campaña usa `/sites/MLA/listing_prices`.
- **Layers pendientes** (el diseño no las incluye aún): Ventas, Competencia,
  Prompts AI y Configuración son placeholders; los checkboxes de la tabla
  todavía no disparan acciones en lote.
