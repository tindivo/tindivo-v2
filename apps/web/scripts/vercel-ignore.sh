#!/usr/bin/env bash
# «Ignored Build Step» de Vercel para tindivo.com (CUS-WPU-011).
# Vercel salta el despliegue si este script sale con 0 y despliega si sale con 1.
#
#   Sale 0 (no desplegar): el último commit no tocó apps/web, packages/legal ni lo que arrastra
#                          todo el monorepo (lockfile, workspace, raíz, turbo, tsconfig base).
#   Sale 1 (desplegar):    cambió alguno de esos, o no se puede saber (sin HEAD^, historial superficial).
set -u

root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1
cd "$root" || exit 1

git rev-parse --verify --quiet HEAD^ >/dev/null || exit 1

if git diff --quiet HEAD^ HEAD -- \
  apps/web \
  packages/legal \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  package.json \
  turbo.json \
  tsconfig.base.json \
  packages/tsconfig; then
  echo "Sin cambios que afecten a apps/web: se omite el despliegue."
  exit 0
fi

echo "Cambió apps/web o algo que importa: se despliega."
exit 1
