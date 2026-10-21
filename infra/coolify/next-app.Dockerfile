# syntax=docker/dockerfile:1.7
#
# Imagen de cualquier app Next del monorepo para Coolify.
#   docker build -f infra/coolify/next-app.Dockerfile --build-arg APP=admin .
# APP es el nombre de la carpeta en apps/ (admin, api, customer, motorizados, negocios).
# El contexto es la raíz del repo; lo que no entra está en next-app.Dockerfile.dockerignore.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# 1) Recorta el monorepo a la app y sus paquetes internos (turbo prune).
FROM base AS pruner
ARG APP
COPY . .
RUN pnpm dlx turbo@2.9.16 prune "@tindivo/${APP}" --docker

# 2) Instala dependencias (capa cacheable: solo cambia con el lockfile) y compila.
FROM base AS builder
ARG APP
COPY --from=pruner /repo/out/json/ .
COPY .npmrc ./
# node_modules plano (hoisted): con los symlinks de pnpm, el trazado del standalone copia el
# binario de @sparticuz/chromium pero no el JS de los serverExternalPackages, y el PDF falla.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --config.node-linker=hoisted
COPY --from=pruner /repo/out/full/ .
# Las NEXT_PUBLIC_* se incrustan en el bundle del navegador durante el build:
# en Coolify se marcan como «Build Variable».
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_CARTO_API_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
RUN pnpm exec turbo run build --filter="@tindivo/${APP}" \
 && mkdir -p "apps/${APP}/public"

# 3) Imagen final: solo el servidor standalone, sin el monorepo ni node_modules completos.
FROM node:${NODE_VERSION}-bookworm-slim AS runner
ARG APP
# El PDF de rendimiento (apps/api) lanza el chrome-headless-shell de @sparticuz/chromium,
# que necesita estas librerías del sistema fuera de AWS Lambda.
RUN if [ "$APP" = "api" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends \
         ca-certificates libnss3 libnspr4 libdbus-1-3 libexpat1 libgbm1 libasound2 \
         libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
         libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 libcairo2 \
      && rm -rf /var/lib/apt/lists/*; \
    fi
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP=${APP}
WORKDIR /app
COPY --from=builder --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=builder --chown=node:node /repo/apps/${APP}/public ./apps/${APP}/public
USER node
EXPOSE 3000
CMD ["sh", "-c", "exec node apps/${APP}/server.js"]
