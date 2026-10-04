import os
from dotenv import load_dotenv
load_dotenv()

PROJECT_ID=os.getenv("PROJECT_ID")

DS_API_KEY=os.getenv("DS_API_KEY")
TOKEN_WHAPI=os.getenv("TOKEN_WHAPI")
PHONE_INTERNAL=os.getenv("PHONE_INTERNAL")
TELEGRAM_BOT_TOKEN=os.getenv("TELEGRAM_BOT_TOKEN")

### NEW VARIABLES

# DB Schema
SCHEMA_ACCOUNTS=os.getenv("SCHEMA_ACCOUNTS")
SCHEMA_MERCADOLIBRE=os.getenv("SCHEMA_MERCADOLIBRE")
SCHEMA_INVENTORY=os.getenv("SCHEMA_INVENTORY")
SCHEMA_AI=os.getenv("SCHEMA_AI")
SCHEMA_TIENDANUBE = os.getenv("SCHEMA_TIENDANUBE")
SCHEMA_MASS_ACTIONS=os.getenv("SCHEMA_MASS_ACTIONS", "mass_actions")

# ─── Acciones masivas (jobs en lote) ────────────────────────────────────────
# Secreto compartido con el worker separado (mass-actions-worker/): vacío =
# endpoints internos SIN auth (dev/tests). En prod setear el mismo valor en
# ambos servicios (Secret Manager).
MASS_ACTIONS_INTERNAL_TOKEN = os.getenv("MASS_ACTIONS_INTERNAL_TOKEN", "")
# Ítems por lote que claima cada llamada de /internal/mass-actions/next.
MASS_ACTIONS_BATCH_SIZE = int(os.getenv("MASS_ACTIONS_BATCH_SIZE", "25"))
# TTL del lease: un job `running` sin heartbeat hace más que esto se marca
# `failed` ("worker perdido") y su cuenta se libera; los ítems `running` sin
# actualizar hace más que esto vuelven a `pending` para ser re-claimados.
MASS_ACTIONS_RECLAIM_SECONDS = int(os.getenv("MASS_ACTIONS_RECLAIM_SECONDS", "600"))

# Database connection
INSTANCE_DB = os.getenv("INSTANCE_DB")  # Cloud SQL instance connection name
USER_DB = os.getenv("USER_DB")
PASSWORD_DB = os.getenv("PASSWORD_DB")
NAME_DB = os.getenv("NAME_DB")

# Modo local (dev/tests): DB_HOST + DB_PORT apuntan a un MySQL cercano
# (contenedor de docker compose o la máquina). Si DB_HOST está vacío se usa
# el connector de Cloud SQL (INSTANCE_DB) — modo deploy.
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT", "3306")

# API auth (tokens for the frontend)
SECRET_KEY = os.getenv("SECRET_KEY", "omnipanel-dev-secret-change-me")

# CORS for the frontend dev server
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "*")

# Base pública del dashboard (deep links de notificaciones).
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5173")