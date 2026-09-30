#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Omnipanel — arranca backend (Flask) + frontend (Vite) SIN docker.
#
#   ./run-native.sh
#
# La forma recomendada es ./run.sh (docker: MySQL local + backend + frontend).
# Este script es el fallback nativo: usa la DB que diga backend/.env
# (DB_HOST=127.0.0.1 → el MySQL local del stack; DB_HOST vacío → Cloud SQL).
#
# - Backend  : http://localhost:8080
# - Frontend : http://localhost:5173   (proxy /api → backend)
# - Ctrl+C detiene ambos procesos.
# - Logs: /tmp/omnipanel-back.log y /tmp/omnipanel-front.log
#
# Variables opcionales: PORT_BACK, PORT_FRONT
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

PORT_BACK="${PORT_BACK:-8080}"
PORT_FRONT="${PORT_FRONT:-5173}"

# ── 1. Credencial de GCP (solo la necesita el modo Cloud SQL o GCS) ───────────
if [ ! -f backend/service_account.json ]; then
  echo "✗ Falta service_account.json en backend/."
  echo "  Copiá el JSON de la service account de GCP a ./backend/service_account.json"
  exit 1
fi
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/backend/service_account.json"
export PORT="$PORT_BACK"

# ── 2. Backend: venv + dependencias ───────────────────────────────────────────
# Verificamos que las dependencias estén instaladas DE VERDAD: un .venv
# copiado de otra máquina puede tener python pero no los paquetes.
if ! backend/.venv/bin/python -c "import flask, sqlalchemy" >/dev/null 2>&1; then
  echo "→ Preparando entorno virtual del backend (la primera vez tarda)..."
  echo "  python3 es: $(command -v python3) ($(python3 --version 2>&1))"
  python3 -m venv --clear backend/.venv 2>/dev/null || python3 -m venv backend/.venv
  if ! backend/.venv/bin/pip install -r backend/requirements.txt; then
    echo ""
    echo "✗ No se pudieron instalar las dependencias de Python."
    echo "  Causas típicas:"
    echo "   · Falta python3-venv  →  Ubuntu/Debian: sudo apt install python3-venv"
    echo "   · Sin conexión a internet / PyPI"
    echo "   · Python muy viejo (se necesita 3.9+)"
    exit 1
  fi
  if ! backend/.venv/bin/python -c "import flask" >/dev/null 2>&1; then
    echo "✗ El venv quedó sin flask. Probalo a mano:"
    echo "  python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt"
    exit 1
  fi
fi

# ── 3. Frontend: dependencias ─────────────────────────────────────────────────
if command -v pnpm >/dev/null 2>&1; then
  PKG="pnpm"
else
  PKG="npm"
fi

# Vite 7 exige Node 20.19+ o 22.12+ (Node 18 de los repos de Ubuntu muere al
# arrancar y deja el puerto 5173 mudo -> ERR_CONNECTION_REFUSED en el browser).
if ! command -v node >/dev/null 2>&1; then
  echo "✗ No encuentro 'node' en tu PATH. Instalalo: https://nodejs.org"
  exit 1
fi
node -e '
  const v = process.versions.node.split(".").map(Number);
  const ok = (v[0] === 20 && v[1] >= 19) || (v[0] === 22 && v[1] >= 12) || v[0] > 22;
  if (!ok) {
    console.error("✗ Tu Node es " + process.versions.node + ". Vite 7 necesita Node 20.19+ o 22.12+.");
    console.error("  Opciones:");
    console.error("   · nvm:   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash");
    console.error("            nvm install 22 && nvm use 22");
    console.error("   · o descargá el instalador de https://nodejs.org");
    process.exit(1);
  }
  console.log("Node " + process.versions.node + " ✓");
'

# Un node_modules copiado de otra máquina (o de otro SO) puede no servir:
# - exigimos el binario de vite, y
# - ejecutamos el binario NATIVO de esbuild: si es de otro sistema operativo
#   (ej. linux-x64 en una Mac), falla y reinstalamos todo.
front_deps_ok() {
  [ -x frontend/node_modules/.bin/vite ] || return 1
  for bin in \
    frontend/node_modules/.pnpm/@esbuild+*/node_modules/@esbuild/*/bin/esbuild \
    frontend/node_modules/esbuild/bin/esbuild; do
    if [ -x "$bin" ]; then
      "$bin" --version >/dev/null 2>&1 && return 0
      return 1
    fi
  done
  return 1
}
if ! front_deps_ok; then
  echo "→ (Re)instalando dependencias del frontend ($PKG)..."
  rm -rf frontend/node_modules
  (cd frontend && $PKG install)
fi

BACK_PID=""
FRONT_PID=""
SCRIPT_PGID=$(ps -o pgid= -p $$ | tr -d ' ')
CLEANED=""

cleanup() {
  [ -n "$CLEANED" ] && return
  CLEANED=1
  echo ""
  echo "→ Deteniendo backend y frontend..."
  for pid in "$BACK_PID" "$FRONT_PID"; do
    [ -n "$pid" ] || continue
    # Hijos directos de ese PID (por si el lanzador dejó nietos, ej. pnpm→vite).
    pkill -TERM -P "$pid" 2>/dev/null || true
    # Matar el process group completo (solo si es distinto al del script).
    pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
    if [ -n "$pgid" ] && [ "$pgid" != "$SCRIPT_PGID" ]; then
      kill -- "-$pgid" 2>/dev/null || true
    fi
    kill "$pid" 2>/dev/null || true
  done
  sleep 1
  # Último recurso: cualquier vite/backend de este repo que haya quedado.
  pkill -f "main.py" 2>/dev/null || true
  pkill -f "node_modules/.bin/vite" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── 4. Arrancar ambos procesos (hijos directos: kill del PID los mata) ──────
# Si el puerto del backend ya está ocupado, avisar enseguida (no esperar 40s).
port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null | grep -qE "[:.]$PORT_BACK[[:space:]]"
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:$PORT_BACK -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}
if port_busy; then
  echo "✗ El puerto $PORT_BACK ya está ocupado por otro proceso."
  echo "  Quién lo usa:"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:$PORT_BACK -sTCP:LISTEN || true
  else
    ss -tlnp 2>/dev/null | grep ":$PORT_BACK " || true
  fi
  echo ""
  echo "  Liberalo y volvé a correr ./run.sh. Ejemplos:"
  echo "    kill -9 \$(lsof -ti tcp:$PORT_BACK)    # si tenés lsof"
  echo "    fuser -k $PORT_BACK/tcp                # si tenés fuser"
  exit 1
fi

echo "→ Backend : puerto $PORT_BACK"
(cd backend && exec .venv/bin/python main.py) > /tmp/omnipanel-back.log 2>&1 &
BACK_PID=$!

echo "→ Frontend: puerto $PORT_FRONT"
# Lanzamos el binario de vite directamente (sin pnpm/npm de por medio):
# así el proceso es hijo directo del script y el kill del PID lo mata.
# --host: que escuche en todas las interfaces (IPv4 + IPv6), así el browser
# llega siempre por localhost, sin importar si resuelve a ::1 o 127.0.0.1.
sh -c "cd frontend && VITE_API_PROXY=\"http://localhost:$PORT_BACK\" exec ./node_modules/.bin/vite --host --port $PORT_FRONT --strictPort" \
  > /tmp/omnipanel-front.log 2>&1 &
FRONT_PID=$!

# ── 5. Esperar al backend y chequear la DB ───────────────────────────────────
# --noproxy: si tu shell tiene http_proxy/HTTPS_PROXY, curl a 127.0.0.1
# igual tiene que ir directo, sin pasar por el proxy.
echo -n "→ Esperando al backend"
for _ in $(seq 1 40); do
  if curl -sf -m 3 --noproxy '*' "http://127.0.0.1:$PORT_BACK/api/health" >/dev/null 2>&1; then
    echo ""
    break
  fi
  echo -n "."
  sleep 1
done

if ! curl -sf -m 3 --noproxy '*' "http://127.0.0.1:$PORT_BACK/api/health" >/dev/null 2>&1; then
  echo ""
  echo "✗ El backend no respondió en 40s."
  echo ""
  echo "  ── Diagnóstico automático ──────────────────────────────────────────────"
  echo ""
  echo "  1) ¿El proceso del backend sigue vivo?"
  pgrep -af "main.py" | grep -v pgrep || echo "     ✗ no hay ningún 'python main.py' corriendo"
  echo ""
  echo "  2) ¿El puerto $PORT_BACK está ocupado por otro proceso?"
  if command -v ss >/dev/null 2>&1; then
    ss -tlnp 2>/dev/null | grep ":$PORT_BACK " || echo "     puerto libre"
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:$PORT_BACK -sTCP:LISTEN 2>/dev/null || echo "     puerto libre"
  else
    echo "     (no hay ss/lsof instalado para verificarlo)"
  fi
  echo ""
  echo "  3) Probando el puerto a mano (sin proxy, salida cruda de curl):"
  curl -sv -m 3 --noproxy '*' "http://127.0.0.1:$PORT_BACK/api/health" 2>&1 | tail -n 8 || true
  echo ""
  echo "  4) Últimas líneas de /tmp/omnipanel-back.log:"
  if [ -s /tmp/omnipanel-back.log ]; then
    tail -n 30 /tmp/omnipanel-back.log
  else
    echo "     (el log está vacío o no existe)"
  fi
  echo ""
  echo "  ────────────────────────────────────────────────────────────────────────"
  echo ""
  echo "  Pegame esa salida y lo arreglo. Causas típicas:"
  echo "   · el puerto $PORT_BACK ya está en uso (otro proceso tuyo)"
  echo "   · falta una dependencia de Python (se ve en el log)"
  echo "   · tu shell tiene proxy (http_proxy) y curl no llega a 127.0.0.1"
  exit 1
fi
echo "✓ Backend OK  → http://localhost:$PORT_BACK/api/health"

# 401 = la DB respondió (credenciales de login incorrectas a propósito);
# 500 = la DB no responde (service account / .env / red).
DB_CODE=$(curl -s -m 20 --noproxy '*' -o /dev/null -w "%{http_code}" -X POST \
  "http://127.0.0.1:$PORT_BACK/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"probe@probe.com","password":"probe"}')
if [ "$DB_CODE" = "401" ]; then
  echo "✓ MySQL Cloud SQL conectado"
else
  echo "✗ La DB no responde (HTTP $DB_CODE) — revisá service_account.json y .env"
  echo "  Log: /tmp/omnipanel-back.log"
fi

# ── 6. Verificar que el frontend realmente sirva la página ───────────────────
echo -n "→ Esperando al frontend"
FRONT_OK=""
for _ in $(seq 1 20); do
  if curl -sf -m 2 --noproxy '*' "http://127.0.0.1:$PORT_FRONT/" >/dev/null 2>&1; then
    FRONT_OK=1
    echo ""
    break
  fi
  echo -n "."
  sleep 1
done
if [ -n "$FRONT_OK" ]; then
  echo "✓ Frontend OK → http://localhost:$PORT_FRONT"
else
  echo ""
  echo "✗ El frontend no respondió. Diagnóstico:"
  echo "  · Node: $(node --version 2>/dev/null || echo 'no instalado')"
  if command -v ss >/dev/null 2>&1; then
    echo "  · Puerto $PORT_FRONT:"
    ss -tln 2>/dev/null | grep ":$PORT_FRONT " || echo "      (nadie está escuchando en $PORT_FRONT)"
  fi
  echo "  · Últimas líneas de /tmp/omnipanel-front.log:"
  tail -n 20 /tmp/omnipanel-front.log
  echo ""
  echo "  Si el log menciona 'esbuild' o 'platform', reinstalá las dependencias:"
  echo "    rm -rf frontend/node_modules && (cd frontend && $PKG install)"
fi

echo ""
echo "  ▶ Frontend: http://localhost:$PORT_FRONT"
echo "  ▶ Backend : http://localhost:$PORT_BACK/api/health"
echo "  ▶ Logs    : /tmp/omnipanel-back.log · /tmp/omnipanel-front.log"
echo ""
echo "  Ctrl+C para detener todo."
echo ""

wait $BACK_PID $FRONT_PID
