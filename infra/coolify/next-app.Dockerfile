# syntax=docker/dockerfile:1.7
#
# Imagen de cualquier app Next del monorepo para Coolify.
#   docker build -f infra/coolify/next-app.Dockerfile --build-arg APP=admin .
# APP es el nombre de la carpeta en apps/ (admin, api, customer, motorizados, negocios).
# El contexto es la raíz del repo; lo que no entra está en next-app.Dockerfile.dockerignore.

# Base reproducible: imagen fijada por digest del índice multiplataforma y apt fijado a una instantánea.
# Para actualizar: toma el digest nuevo de node:24-bookworm-slim (cabecera docker-content-digest de
#   HEAD https://registry-1.docker.io/v2/library/node/manifests/24-bookworm-slim con Accept de índice OCI),
# elige otra fecha de snapshot.debian.org (comprueba que sus Release respondan) y cambia ambos valores
# en un commit revisable. El digest debe ser el mismo en las dos etapas FROM.
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS base
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
# Activa output: 'standalone' en los next.config.ts (en Vercel no se define y queda como antes).
ENV TINDIVO_NEXT_STANDALONE=1
RUN pnpm exec turbo run build --filter="@tindivo/${APP}" \
 && mkdir -p "apps/${APP}/public"

# 3) Imagen final: solo el servidor standalone, sin el monorepo ni node_modules completos.
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS runner
ARG APP
# El PDF de rendimiento (apps/api) lanza el chrome-headless-shell de @sparticuz/chromium,
# que necesita estas librerías del sistema fuera de AWS Lambda.
RUN if [ "$APP" = "api" ]; then \
      printf '%s\n' \
        'Types: deb' \
        'URIs: http://snapshot.debian.org/archive/debian/20261020T000000Z' \
        'Suites: bookworm bookworm-updates' \
        'Components: main' \
        'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
        '' \
        'Types: deb' \
        'URIs: http://snapshot.debian.org/archive/debian-security/20261020T000000Z' \
        'Suites: bookworm-security' \
        'Components: main' \
        'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
        > /etc/apt/sources.list.d/debian.sources \
      && apt-get -o Acquire::Check-Valid-Until=false update \
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
