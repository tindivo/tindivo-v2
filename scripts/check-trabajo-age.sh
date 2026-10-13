#!/usr/bin/env bash
# Lista los temas de Docs/trabajo/ sin commits en más de N días (Docs/README.md §5).
# Es un aviso: siempre termina con 0. decisiones-abiertas.md está exento (no es un tema).
#
# Uso: scripts/check-trabajo-age.sh [días]      (por defecto: 30)
set -euo pipefail

DAYS="${1:-30}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

now="$(date +%s)"
limit=$((DAYS * 86400))
stale=0

for dir in Docs/trabajo/*/; do
  [ -d "$dir" ] || continue
  last="$(git log -1 --format=%ct -- "$dir" 2>/dev/null || true)"
  [ -n "$last" ] || continue   # aún sin commits: no está en el repo
  if [ $((now - last)) -gt "$limit" ]; then
    echo "Sin actividad hace $(((now - last) / 86400)) días: ${dir%/} (cerrar o justificar)"
    stale=$((stale + 1))
  fi
done

if [ "$stale" -eq 0 ]; then
  echo "Ningún tema de Docs/trabajo/ supera ${DAYS} días sin actividad."
fi
exit 0
