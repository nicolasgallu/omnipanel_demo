# ── Stage 1: build the React app ─────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
# corepack provee pnpm; fijamos la versión para builds reproducibles
# (el lockfile es v9, pnpm 9.15+ lo lee sin problemas).
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ── Stage 2: serve with nginx, proxying /api to the backend service ──────────
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
