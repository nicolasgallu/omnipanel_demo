#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Omnipanel — UN SOLO COMANDO: levanta toda la app con Docker.
#
#   ./run.sh
#
# - MySQL local :3306  (mysql:8.4; en el PRIMER arranque carga el seed con
#   los datos reales: backend/seed_data.sql)
# - Backend      : http://localhost:8080  (gunicorn; DB_HOST=mysql)
# - Frontend     : http://localhost:5173  (nginx; proxy /api -> backend)
#
# Los datos persisten en el volumen `mysql_data`.
#   · Re-seed desde cero : docker compose down -v && ./run.sh
#   · Refrescar el seed desde Cloud SQL: backend/scripts/export_seed.sh
#   · Bajar todo         : docker compose down
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

# ── 1. Requisitos ─────────────────────────────────────────────────────────────
if ! docker compose version >/dev/null 2>&1; then
  echo "✗ No encuentro docker (con el plugin compose)."
  echo "  Instalalo desde https://docs.docker.com/engine/install/ y volvé a intentar."
  exit 1
fi

if [ ! -f backend/seed_data.sql ]; then
  echo "✗ Falta backend/seed_data.sql (el dump que carga el MySQL local)."
  echo "  Generalo una vez con:  backend/scripts/export_seed.sh"
  exit 1
fi

if [ ! -f backend/service_account.json ]; then
  echo "✗ Falta backend/service_account.json."
  echo "  La DB ya es local, pero el backend lo usa para GCS (imágenes/logo)."
  echo "  Copiá el JSON de la service account de GCP a ./backend/service_account.json"
  exit 1
fi

# ── 2. Puertos libres ─────────────────────────────────────────────────────────
port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null | grep -qE "[:.]$1[[:space:]]"
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:$1 -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}
for p in 3306 8080 5173; do
  if port_busy "$p"; then
    echo "✗ El puerto $p ya está ocupado por otro proceso."
    (ss -tlnp 2>/dev/null | grep ":$p " || lsof -nP -iTCP:$p -sTCP:LISTEN 2>/dev/null) || true
    echo "  Liberalo y volvé a correr ./run.sh"
    exit 1
  fi
done

# ── 3. Levantar el stack ──────────────────────────────────────────────────────
echo "→ Levantando MySQL + backend + frontend (docker compose)…"
echo "  La primera vez tarda: baja imágenes, builda y carga el seed en la DB."
echo ""
docker compose --env-file backend/.env up -d --build

# Si mysql no quedó corriendo, mostrar su log y salir (la causa está ahí).
MYSQL_STATE=$(docker compose ps -a --format '{{.Service}}|{{.State}}' 2>/dev/null | awk -F'|' '$1=="mysql"{print $2}')
if [ "$MYSQL_STATE" != "running" ]; then
  echo ""
  echo "✗ El contenedor mysql no quedó corriendo (estado: ${MYSQL_STATE:-desconocido})."
  echo "  Últimas líneas de su log:"
  docker compose logs --tail 60 mysql 2>/dev/null || true
  echo ""
  echo "  Causas típicas: puerto 3306 ocupado en tu máquina, o el seed falló al cargar."
  exit 1
fi

# ── 4. Esperar a que estén arriba ─────────────────────────────────────────────
echo -n "→ Esperando al backend (si es el primer arranque, el seed tarda)"
for _ in $(seq 1 150); do
  if curl -sf -m 2 --noproxy '*' "http://127.0.0.1:8080/api/health" >/dev/null 2>&1; then
    echo " ✓"; break
  fi
  echo -n "."; sleep 2
done
if ! curl -sf -m 2 --noproxy '*' "http://127.0.0.1:8080/api/health" >/dev/null 2>&1; then
  echo ""
  echo "✗ El backend no respondió. Mirá los logs:"
  echo "    docker compose logs backend mysql"
  echo "  Si es el primer arranque puede ser el seed todavía cargando."
  exit 1
fi

echo -n "→ Esperando al frontend"
for _ in $(seq 1 30); do
  if curl -sf -m 2 --noproxy '*' "http://127.0.0.1:5173/" >/dev/null 2>&1; then
    echo " ✓"; break
  fi
  echo -n "."; sleep 2
done

echo ""
echo "  ▶ Frontend : http://localhost:5173"
echo "  ▶ Backend  : http://localhost:8080/api/health"
echo "  ▶ MySQL    : localhost:3306 (datos en el volumen mysql_data)"
echo ""
echo "  Logs      : docker compose logs -f"
echo "  Bajar todo: docker compose down"
echo "  Re-seed   : docker compose down -v && ./run.sh"
echo ""
