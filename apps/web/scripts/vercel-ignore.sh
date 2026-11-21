#!/usr/bin/env bash
# «Ignored Build Step» de Vercel para tindivo.com (CUS-WPU-011).
# Vercel salta el despliegue si este script sale con 0 y despliega si sale con 1.
#
#   Sale 0 (no desplegar): nada de lo desplegado desde el último despliegue tocó apps/web, packages/legal ni lo que arrastra
#                          todo el monorepo (lockfile, workspace, raíz, turbo, tsconfig base).
#   Sale 1 (desplegar):    cambió alguno de esos, o no hay una base del último despliegue en la que confiar.
#
# La base es solo VERCEL_GIT_PREVIOUS_SHA (el último despliegue de la rama), y tiene que ser un SHA completo, alcanzable,
# distinto de HEAD y antecesor suyo. Si no, se despliega: nunca se sustituye por HEAD^, que en un push de varios commits
# esconde los anteriores (CAX-001).
set -u

root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1
cd "$root" || exit 1

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
case "$base" in
  *[!0-9a-f]* | "") exit 1 ;;
esac
[ "${#base}" -eq 40 ] || exit 1
git cat-file -e "${base}^{commit}" 2>/dev/null || exit 1
[ "$base" != "$(git rev-parse HEAD)" ] || exit 1
git merge-base --is-ancestor "$base" HEAD || exit 1

if git diff --quiet "$base" HEAD -- \
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
