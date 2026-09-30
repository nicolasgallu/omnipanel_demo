# ─────────────────────────────────────────────────────────────────────────────
# Omnipanel — contenedor mergeado para Cloud Run
#   Stage 1: build del frontend React (Vite)
#   Stage 2: backend Flask (gunicorn) + frontend/dist servido por Flask
#
# Una sola imagen, un solo puerto (8080): el dashboard y /api viven en el
# mismo origen (sin CORS ni proxy externo). main.py sirve el SPA cuando existe
# frontend_dist/ (ver _serve_frontend).
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: frontend ─────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ .
RUN pnpm build

# ── Stage 2: backend + frontend/dist ─────────────────────────────────────────
FROM python:3.10-slim
WORKDIR /app

# Zona horaria (Argentina), igual que el dockerfile de desarrollo.
RUN apt-get update && apt-get install -y tzdata \
    && rm -rf /var/lib/apt/lists/*
ENV TZ=America/Argentina/Buenos_Aires
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Dependencias Python.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código del backend (main.py + app/ + gunicorn_config.py) en /app.
COPY backend/ /app

# Build del frontend → /app/frontend_dist (lo sirve main.py como SPA).
COPY --from=frontend /app/dist /app/frontend_dist

ENV PORT=8080
EXPOSE 8080

CMD ["python", "-m", "gunicorn", "-c", "gunicorn_config.py", "main:app"]
