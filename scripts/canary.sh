#!/usr/bin/env bash
# Verificación de carga de instrucciones con tokens aleatorios
# (Docs/operacion/verificar-carga-de-instrucciones.md).
#
#   scripts/canary.sh place   crea un worktree temporal y añade un token a cada archivo de instrucciones
#   scripts/canary.sh check   compara las respuestas guardadas en <worktree>/.canary/*.txt
#   scripts/canary.sh clean   borra el worktree y los tokens esperados
#
# Variable opcional: CANARY_WORKTREE (por defecto: $TMPDIR/tindivo-canary o /tmp/tindivo-canary).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
COMMON="$(cd "$ROOT" && cd "$(git rev-parse --git-common-dir)" && pwd)"
STATE="${COMMON}/canary"            # fuera del árbol de trabajo: el agente no lo ve sin leer .git
WT="${CANARY_WORKTREE:-${TMPDIR:-/tmp}/tindivo-canary}"

random_hex() {
  od -An -N6 -tx1 /dev/urandom | tr -d ' \n'
}

place() {
  if [ -e "$WT" ]; then
    echo "Ya existe ${WT}. Ejecuta 'scripts/canary.sh clean' primero." >&2
    exit 1
  fi
  mkdir -p "$STATE"
  : > "${STATE}/expected.tsv"
  git -C "$ROOT" worktree add --detach "$WT" HEAD >/dev/null 2>&1

  while IFS= read -r file; do
    token="TC-$(random_hex)"
    printf '\n\nToken de carga: %s\n' "$token" >> "${WT}/${file}"
    printf '%s\t%s\n' "$file" "$token" >> "${STATE}/expected.tsv"
  done < <(git -C "$WT" ls-files -- 'AGENTS.md' 'CLAUDE.md' 'GEMINI.md' '*/AGENTS.md' '*/CLAUDE.md' '*/GEMINI.md')

  if [ ! -s "${STATE}/expected.tsv" ]; then
    echo "No hay archivos de instrucciones versionados." >&2
    exit 1
  fi
  mkdir -p "${WT}/.canary"
  echo "Worktree: ${WT}"
  echo "Archivos con token:"
  cut -f1 "${STATE}/expected.tsv" | sed 's/^/  /'
  echo "Guarda cada respuesta en ${WT}/.canary/<herramienta>-<directorio>.txt y ejecuta 'scripts/canary.sh check'."
}

check() {
  if [ ! -s "${STATE}/expected.tsv" ]; then
    echo "No hay tokens esperados. Ejecuta 'scripts/canary.sh place' primero." >&2
    exit 1
  fi
  shopt -s nullglob
  local responses=("${WT}"/.canary/*.txt)
  if [ "${#responses[@]}" -eq 0 ]; then
    echo "No hay respuestas en ${WT}/.canary/." >&2
    exit 1
  fi
  for response in "${responses[@]}"; do
    echo "== $(basename "$response" .txt)"
    while IFS=$'\t' read -r file token; do
      if grep -qF "$token" "$response"; then
        echo "  cargado:    ${file}"
      else
        echo "  no cargado: ${file}"
      fi
    done < "${STATE}/expected.tsv"
  done
}

clean() {
  git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  git -C "$ROOT" worktree prune
  rm -rf "$STATE"
  echo "Limpio."
}

case "${1:-}" in
  place) place ;;
  check) check ;;
  clean) clean ;;
  *)
    echo "Uso: scripts/canary.sh place | check | clean" >&2
    exit 2
    ;;
esac
