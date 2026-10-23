#!/usr/bin/env bash
# Copia el contrato OpenAPI a las apps nativas (CLI-1).
#   scripts/sync-openapi.sh           copia
#   scripts/sync-openapi.sh --check   falla si alguna copia difiere (para CI)
# Una app que aún no existe se omite.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

SRC="packages/contracts/openapi/v1.json"
# El nombre del archivo en iOS sigue la documentación de swift-openapi-generator: verificar al montarlo.
TARGETS=(
  "apps/customer-ios/Packages/TindivoAPI/Sources/TindivoAPI/openapi.json"
  "apps/android/core/network/openapi/v1.json"
)

mode="${1:-sync}"
if [ ! -f "$SRC" ]; then
  echo "No existe ${SRC}." >&2
  exit 1
fi

status=0
for target in "${TARGETS[@]}"; do
  app_dir="$(echo "$target" | cut -d/ -f1-2)"
  if [ ! -d "$app_dir" ]; then
    echo "Omitido (no existe ${app_dir}): ${target}"
    continue
  fi
  if [ "$mode" = "--check" ]; then
    if cmp -s "$SRC" "$target"; then
      echo "Al día: ${target}"
    else
      echo "Desactualizado: ${target}. Ejecuta scripts/sync-openapi.sh"
      status=1
    fi
  else
    mkdir -p "$(dirname "$target")"
    cp "$SRC" "$target"
    echo "Copiado: ${target}"
  fi
done
exit "$status"
