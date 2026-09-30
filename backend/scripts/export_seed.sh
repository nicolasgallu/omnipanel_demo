#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Exporta la DB de Cloud SQL (schemas + datos) a backend/seed_data.sql
#
# Ese archivo es el seed del MySQL local de docker compose: se carga solo en
# el primer arranque del contenedor. Volvé a correr este script cuando quieras
# refrescar los datos locales con el estado actual de la instancia de GCP.
#
#   ./scripts/export_seed.sh
#
# Requiere: backend/.env + backend/service_account.json (baja el binary
# cloud-sql-proxy la primera vez a /tmp).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "✗ Falta backend/.env"; exit 1; }
[ -f service_account.json ] || { echo "✗ Falta backend/service_account.json"; exit 1; }

set -a; . ./.env; set +a
[ -n "$INSTANCE_DB" ] || { echo "✗ INSTANCE_DB no está en .env"; exit 1; }

PROXY_BIN=/tmp/cloud-sql-proxy
if [ ! -x "$PROXY_BIN" ]; then
  echo "→ Bajando cloud-sql-proxy…"
  curl -fsSL -o "$PROXY_BIN" \
    "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.15.2/cloud-sql-proxy.linux.amd64"
  chmod +x "$PROXY_BIN"
fi

PORT_PROXY="${PORT_PROXY:-3307}"
"$PROXY_BIN" --credentials-file service_account.json --port "$PORT_PROXY" "$INSTANCE_DB" \
  > /tmp/cloud-sql-proxy-seed.log 2>&1 &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null || true' EXIT

echo -n "→ Conectando a Cloud SQL"
for _ in $(seq 1 30); do
  if mysqladmin -h 127.0.0.1 -P "$PORT_PROXY" -u "$USER_DB" -p"$PASSWORD_DB" ping >/dev/null 2>&1; then
    echo " OK"; break
  fi
  echo -n "."; sleep 2
done
mysqladmin -h 127.0.0.1 -P "$PORT_PROXY" -u "$USER_DB" -p"$PASSWORD_DB" ping >/dev/null 2>&1 \
  || { echo ""; echo "✗ No se pudo conectar (ver /tmp/cloud-sql-proxy-seed.log)"; exit 1; }

echo "→ Dumpeando schemas con datos…"
mysqldump -h 127.0.0.1 -P "$PORT_PROXY" -u "$USER_DB" -p"$PASSWORD_DB" \
  --single-transaction --quick --hex-blob \
  --default-character-set=utf8mb4 --routines --triggers --events \
  --databases "$SCHEMA_ACCOUNTS" "$SCHEMA_INVENTORY" "$SCHEMA_MERCADOLIBRE" \
               "$SCHEMA_TIENDANUBE" "$SCHEMA_AI" \
  > seed_data.sql

ls -lh seed_data.sql
echo "✓ Listo. Para refrescar el MySQL local: docker compose down -v && ./run.sh"
