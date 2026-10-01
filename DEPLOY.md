# Despliegue en GCP (Cloud Run + Cloud SQL)

Flujo objetivo: **un push = deploy**. El trigger de Cloud Build lee
`/cloudbuild.yaml`, construye la imagen mergeada (frontend + backend) y la
despliega a Cloud Run en `us-south1` (misma región que Cloud SQL).

Las **variables de entorno** se setean directo en el servicio de Cloud Run
(consola o `gcloud run services update`), NO en Secret Manager. Los valores
reales están en `backend/.env.production` (gitignored, no se pushea).

## Archivos de este deploy

- `Dockerfile` — imagen única: build del frontend (Vite) + backend Flask
  (gunicorn) sirviendo `frontend/dist`.
- `cloudbuild.yaml` — pipeline build → push → `gcloud run deploy` (sin env vars).
- `.gcloudignore` / `.dockerignore` — excluyen secrets, venvs, node_modules y
  el dump de la DB del build.
- `backend/main.py` — sirve el SPA cuando existe `frontend_dist/`
  (no-op en dev/tests, ver `_serve_frontend`).
- `backend/.env.production` — variables + valores reales (GITIGNOREADO).

## Setup de una sola vez

```bash
gcloud config set project nicoservertest

# 1) APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com sqladmin.googleapis.com

# 2) Artifact Registry (si no existe)
gcloud artifacts repositories create omnipanel-demo-registry \
  --repository-format=docker --location=northamerica-northeast1

# 3) Service account del runtime de Cloud Run
gcloud iam service-accounts create omnipanel-cloudrun \
  --display-name="Omnipanel Cloud Run runtime"
SA=omnipanel-cloudrun@nicoservertest.iam.gserviceaccount.com

# 4) Roles del runtime SA (Cloud SQL + GCS). NO hace falta Secret Manager.
gcloud projects add-iam-policy-binding nicoservertest \
  --member="serviceAccount:$SA" --role=roles/cloudsql.client
gcloud projects add-iam-policy-binding nicoservertest \
  --member="serviceAccount:$SA" --role=roles/storage.objectAdmin
```

### Permisos de quien ejecuta el deploy

El paso de deploy de Cloud Build corre, según el proyecto, como **la SA de Cloud
Build** (`<nro>@cloudbuild.gserviceaccount.com`) o como **la Compute default**
(`<nro>-compute@developer.gserviceaccount.com`). La que ejecute el deploy
necesita `run.admin` (desplegar) + `iam.serviceAccountUser` (actuar como la SA
del runtime).

⚠️ El account real aparece en el error del build (ej.
`402745694567-compute@developer.gserviceaccount.com`). Ese es el que tenés que
autorizar, NO necesariamente el de Cloud Build:

```bash
DEPLOYER=402745694567-compute@developer.gserviceaccount.com   # ← el de TU error
gcloud projects add-iam-policy-binding nicoservertest \
  --member="serviceAccount:$DEPLOYER" --role=roles/run.admin
gcloud projects add-iam-policy-binding nicoservertest \
  --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser
```

Alternativa más limpia: en el trigger de Cloud Build → "Service account", elegí
la SA de Cloud Build (`<nro>@cloudbuild.gserviceaccount.com`) y autorizá esa en
vez de la compute default.

### Cloud SQL

La instancia `nicoservertest:us-south1:new-test-2` ya existe. Requisitos:

- Debe tener **IP pública** habilitada (el connector usa IAM, no VPC). Si solo
  tiene IP privada, hace falta un Serverless VPC Connector.
- El runtime SA ya tiene `roles/cloudsql.client` (paso 4).

## Crear el trigger (consola)

1. Cloud Build → Triggers → **Create trigger**.
2. Name: `omnipanel-deploy`.
3. Event: **Push to a branch**; branch `^master$`.
4. Source: conectar tu repo (GitHub / Cloud Source Repositories).
5. Configuration → **Cloud Build configuration file** → path: `cloudbuild.yaml`.
6. Substitutions: dejar los defaults (podés override `_MIN_INSTANCES` /
   `_MAX_INSTANCES` / `_CONCURRENCY` acá sin tocar el repo).
7. Create.

## Push y verificar

```bash
git add -A && git commit -m "deploy: Cloud Run + Cloud SQL" && git push origin master
```

En Cloud Build → History vas a ver el build. Al terminar, el servicio queda en
Cloud Run → `omnipanel`, con una URL tipo `https://omnipanel-XXXX-YY.a.run.app`.

## Variables de entorno (una vez, después del primer deploy)

El deploy NO setea env vars (a propósito, para no pisar lo que configures en la
consola). Setealas así:

```bash
gcloud run services update omnipanel --region=us-south1 \
  --set-env-vars=PROJECT_ID=nicoservertest,INSTANCE_DB=nicoservertest:us-south1:new-test-2,USER_DB=nicolas,PASSWORD_DB=test,NAME_DB=platform_accounts,SCHEMA_ACCOUNTS=platform_accounts,SCHEMA_INVENTORY=inventory,SCHEMA_MERCADOLIBRE=mercadolibre,SCHEMA_TIENDANUBE=tiendanube,SCHEMA_AI=ai,SECRET_KEY=<de .env.production>,DS_API_KEY=<de .env.production>,TOKEN_WHAPI=<de .env.production>,TELEGRAM_BOT_TOKEN=<de .env.production>,PHONE_INTERNAL=5493517710609,OAUTH_CALLBACK_URL=https://<URL>/api/oauth/callback,CORS_ORIGIN=*
```

Copiá los valores reales de `backend/.env.production` (los `<...>` de arriba).
También podés pegarlos uno a uno en la consola (Cloud Run → omnipanel →
Edit & Deploy New Revision → Variables).

⚠️ **`DB_HOST` debe quedar SIN setear** (vacío). Eso es lo que activa el
connector de Cloud SQL. No lo agregues.

Verificar: `curl https://<URL>/api/health` → `{"status":"ok"}`.

## Después del primer deploy

1. **OAuth**: actualizá `OAUTH_CALLBACK_URL` a la URL real
   `https://<URL>/api/oauth/callback` y registrá esa redirect_uri exacta en
   Meli DevCenter y en la app de Tienda Nube.
2. **Webhooks**: re-apuntar Meli DevCenter (topics) y Tienda Nube a
   `https://<URL>/webhooks/meli` y `https://<URL>/webhooks/sells` (antes iban
   por el tunnel de Cloudflare). Sin esto no llegan eventos.
3. `backend/cloudbuild.yaml` es el config viejo (build a us-central1, sin
   deploy); podés borrarlo. El trigger usa el `/cloudbuild.yaml` de la raíz.

## Notas

- `DB_HOST` se deja **vacío** (no se setea) → el backend usa el connector de
  Cloud SQL (`INSTANCE_DB`). Si lo setearas, intentaría un MySQL por TCP.
- Registro de imágenes en `northamerica-northeast1` (solo almacenamiento);
  Cloud Run corre en `us-south1` (junto a la DB). Es válido; si querés podés
  crear el registry también en `us-south1` para deploys marginalmente más
  rápidos, pero no es necesario.
- El frontend se sirve desde el mismo origen que `/api` (sin CORS ni proxy
  externo). Servir los estáticos desde GCS + CDN queda como optimización futura.
- En Cloud Run NO se setea `GOOGLE_APPLICATION_CREDENTIALS`: GCS y el connector
  usan ADC (la service account del runtime).
