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