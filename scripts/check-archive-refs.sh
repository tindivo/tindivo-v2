#!/usr/bin/env bash
# Comprueba que toda referencia `<ref>:<ruta>` citada en el canon, en planes/ o en los
# archivos de agentes resuelve en git, y que su ref es una etiqueta archive/* o un
# ancestro de la rama base (Docs/README.md §2.3 y §8.5).
#
# Uso: scripts/check-archive-refs.sh [rama-base]      (por defecto: origin/develop)
# En CI hace falta la historia completa y las etiquetas (actions/checkout con fetch-depth: 0).
set -euo pipefail

BASE="${1:-origin/develop}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if ! git rev-parse --verify --quiet "${BASE}^{commit}" >/dev/null; then
  echo "No existe la rama base '${BASE}'. Pásala como argumento (por ejemplo: origin/main)." >&2
  exit 2
fi

# Citas de la forma <sha>:<ruta> o archive/<tema>:<ruta>. Los marcadores como
# archive/<tema>:… no coinciden, porque «<» no forma parte del patrón.
PATTERN='(archive/[A-Za-z0-9._-]+|[0-9a-f]{7,40}):(Docs|apps|packages|supabase|scripts)/[A-Za-z0-9._/-]*'

failures=0
checked=0

fail() {
  echo "ERROR ${1}: ${2}"
  failures=$((failures + 1))
}

while IFS= read -r file; do
  case "$file" in
    Docs/trabajo/*) continue ;;
  esac
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    line="${hit%%:*}"
    match="${hit#*:}"
    ref="${match%%:*}"
    path="${match#*:}"
    path="${path%/}"
    where="${file}:${line} (${ref}:${path})"
    checked=$((checked + 1))

    if ! git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null; then
      fail "$where" "no existe el commit o la etiqueta"
      continue
    fi

    case "$ref" in
      archive/*)
        if ! git show-ref --verify --quiet "refs/tags/${ref}"; then
          fail "$where" "'${ref}' no es una etiqueta"
        fi
        ;;
      *)
        if ! git merge-base --is-ancestor "$ref" "$BASE"; then
          fail "$where" "el commit no es ancestro de ${BASE}: crea una etiqueta archive/<tema> y cítala"
        fi
        ;;
    esac

    if ! git cat-file -e "${ref}:${path}" 2>/dev/null; then
      fail "$where" "la ruta no existe en ese commit"
    fi
  done < <(grep -noE "$PATTERN" "$file" || true)
done < <(git ls-files -- 'Docs/*.md' 'AGENTS.md' 'CLAUDE.md' '*/AGENTS.md' '*/CLAUDE.md' | sort -u)

if [ "$failures" -gt 0 ]; then
  echo "${failures} referencia(s) rota(s) de ${checked} revisada(s)."
  exit 1
fi
echo "OK: ${checked} referencia(s) revisada(s)."
