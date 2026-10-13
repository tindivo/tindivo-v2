#!/usr/bin/env bash
# Las excepciones a los estándares solo pueden bajar (Docs/arquitectura/estandares/README.md, «Excepciones»).
#   scripts/check-excepciones.sh <ref-base>     p. ej. origin/develop
# Cuenta las filas de datos de la tabla de Docs/arquitectura/excepciones.md en el commit actual y en la rama base, y
# falla si hay más que en la base. Si la base aún no tiene el archivo, no hay con qué comparar y pasa.
set -euo pipefail

FILE="Docs/arquitectura/excepciones.md"
base_ref="${1:?Uso: scripts/check-excepciones.sh <ref-base>}"

count_rows() {
  # Fila de datos = empieza por «|» y no es el encabezado («| Regla |») ni la línea de guiones.
  grep -E '^\|' | grep -Ev '^\|[[:space:]]*Regla[[:space:]]*\|' | grep -Ev '^\|[-: |]+\|?$' | wc -l | tr -d ' '
}

head_count="$(count_rows < "$FILE")"

if ! base_content="$(git show "${base_ref}:${FILE}" 2>/dev/null)"; then
  echo "La base (${base_ref}) no tiene ${FILE}: nada con qué comparar. Excepciones ahora: ${head_count}."
  exit 0
fi
base_count="$(printf '%s\n' "$base_content" | count_rows)"

echo "Excepciones: base ${base_ref} = ${base_count}, esta rama = ${head_count}."
if [ "$head_count" -gt "$base_count" ]; then
  echo "Subieron ${base_count} -> ${head_count}. Solo puede bajar, salvo aprobación explícita de Jesús en el PR (etiqueta excepciones-aprobadas)." >&2
  exit 1
fi
