#!/usr/bin/env bash
# Construye la imagen de una app para Coolify y demuestra con centinelas SINTÉTICOS que ningún secreto llega al contexto
# de build, a la etapa `pruner` ni a la imagen final, y que las NEXT_PUBLIC_* sí llegan al build. Deja un inventario.
# Uso (desde la raíz del repo, con Docker + BuildKit):  bash infra/coolify/verify-image.sh <app> <carpeta-de-salida>
# Los centinelas son inventados: pueden salir en los logs. No usa secretos reales ni sube nada a ningún registro.
set -euo pipefail
export LC_ALL=C

APP="${1:?uso: verify-image.sh <app> <salida>}"
OUT="$(mkdir -p "${2:?uso: verify-image.sh <app> <salida>}" && cd "$2" && pwd)"
RUN_ID="${GITHUB_RUN_ID:-local$$}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
DOCKERFILE=infra/coolify/next-app.Dockerfile
IMG="tindivo-${APP}:prueba"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
REPORT="$OUT/reporte.txt"
: > "$REPORT"
FAIL=0

rep() { printf '%s\n' "$*" | tee -a "$REPORT"; }
fail() { FAIL=1; rep "FALLO: $*"; }

rep "app=$APP run_id=$RUN_ID commit=$(git rev-parse HEAD)"
rep "docker: $(docker --version) | buildx: $(docker buildx version)"

# ---------- 1. Centinelas ----------
declare -A SENT # valor -> nombre
PLANTED=()
plant() { # plant <ruta> <NOMBRE>
  local path="$1" name="$2" value="TNDV_CENTINELA_${2}_${RUN_ID}"
  mkdir -p "$(dirname "$path")"
  printf 'CLAVE=%s\n' "$value" > "$path"
  SENT["$value"]="$name"
  PLANTED+=("$path")
}
plant .env RAIZ_ENV
plant .env.local RAIZ_ENV_LOCAL
plant .env.production RAIZ_ENV_PRODUCTION
plant "apps/${APP}/.env.local" APP_ENV_LOCAL
plant apps/api/.env.production API_ENV_PRODUCTION
plant packages/core/.env CORE_ENV
plant .codex/auth.json CODEX_AUTH
plant .agents/secreto.txt AGENTS_SECRETO
plant .claude/settings.local.json CLAUDE_SETTINGS
plant supabase/.temp/project-ref SUPABASE_TEMP
plant credentials.json CREDENTIALS
plant secrets/clave.txt SECRETS_CLAVE
plant id_rsa ID_RSA
plant deep/nested/dir/.env DEEP_ENV
plant "apps/${APP}/public/.env" PUBLIC_ENV
# Variable de entorno del runner: no se pasa como build-arg y no debe aparecer en ninguna parte.
export SUPABASE_SERVICE_ROLE_KEY="TNDV_CENTINELA_ENV_SERVICE_ROLE_${RUN_ID}"
SENT["$SUPABASE_SERVICE_ROLE_KEY"]=ENV_SERVICE_ROLE
PAT="$WORK/patrones.txt"
printf '%s\n' "${!SENT[@]}" > "$PAT"
rep "centinelas plantados: ${#SENT[@]} (${#PLANTED[@]} archivos + 1 variable de entorno)"

# scan <directorio-o-archivo> <etiqueta>: cuenta coincidencias; imprime SOLO ruta y nombre del centinela.
scan() {
  local target="$1" label="$2" hits=0 line file val
  while IFS= read -r line; do
    file="${line%:*}"
    val="${line##*:}"
    rep "  CENTINELA ENCONTRADO [$label] ${file#"$target"/} -> ${SENT[$val]:-?}"
    hits=$((hits + 1))
  done < <(grep -raoHF -f "$PAT" -r -- "$target" 2>/dev/null | sort -u)
  if [ "$hits" -eq 0 ]; then rep "centinelas en $label: 0/${#SENT[@]}"; else fail "centinelas en $label: $hits"; fi
}

# Control positivo del buscador: si nunca encontrara nada, el 0 no probaría nada.
mkdir "$WORK/control"
printf 'x%sx' "$SUPABASE_SERVICE_ROLE_KEY" > "$WORK/control/f.bin"
if grep -raqF -f "$PAT" -r -- "$WORK/control"; then rep "control positivo del buscador: OK"; else fail "el buscador no detecta un centinela conocido"; fi

BUILD_FLAGS=(--progress=plain)

# ---------- 2. Contexto recibido (CAX-001) ----------
mkdir -p "$WORK/sondeo" "$WORK/ctx"
printf 'FROM scratch\nCOPY . /\n' > "$WORK/sondeo/sondeo.Dockerfile"
cp infra/coolify/next-app.Dockerfile.dockerignore "$WORK/sondeo/sondeo.Dockerfile.dockerignore"
docker buildx build "${BUILD_FLAGS[@]}" -f "$WORK/sondeo/sondeo.Dockerfile" --output "type=local,dest=$WORK/ctx" . \
  > "$OUT/build-contexto.log" 2>&1 || { tail -n 40 "$OUT/build-contexto.log"; fail "no se pudo construir el sondeo de contexto"; exit 1; }
chmod -R u+rwX "$WORK/ctx"
(cd "$WORK/ctx" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$OUT/contexto-archivos.txt"
rep "archivos en el contexto: $(wc -l < "$OUT/contexto-archivos.txt")"
if [ -f "$WORK/ctx/package.json" ] && [ -f "$WORK/ctx/apps/${APP}/package.json" ]; then
  rep "control: el contexto lleva package.json y apps/${APP}/package.json"
else
  fail "el contexto no lleva lo que el build necesita"
fi
for p in "${PLANTED[@]}"; do
  if [ -e "$WORK/ctx/$p" ]; then fail "archivo plantado en el contexto: $p"; fi
done
scan "$WORK/ctx" "contexto"
rm -rf "$WORK/ctx"

# ---------- 3. Etapa pruner ----------
mkdir -p "$WORK/pruner"
docker buildx build "${BUILD_FLAGS[@]}" -f "$DOCKERFILE" --target pruner --build-arg "APP=${APP}" \
  --output "type=local,dest=$WORK/pruner" . > "$OUT/build-pruner.log" 2>&1 \
  || { tail -n 40 "$OUT/build-pruner.log"; fail "falló el build de la etapa pruner"; exit 1; }
chmod -R u+rwX "$WORK/pruner"
(cd "$WORK/pruner" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$OUT/pruner-archivos.txt"
rep "archivos en pruner: $(wc -l < "$OUT/pruner-archivos.txt")"
scan "$WORK/pruner" "pruner"
rm -rf "$WORK/pruner"

# ---------- 4. Imagen final ----------
mapfile -t PUB < <(grep -oE '^ARG NEXT_PUBLIC_[A-Z0-9_]+' "$DOCKERFILE" | sed 's/^ARG NEXT_PUBLIC_//')
declare -A PUBVAL
ARGS=()
for n in "${PUB[@]}"; do
  case "$n" in
    SUPABASE_URL | API_URL | APP_URL) v="https://tndv-publico-$(printf '%s' "$n" | tr 'A-Z_' 'a-z-')-${RUN_ID}.example.com" ;;
    *) v="TNDV_PUBLICO_${n}_${RUN_ID}" ;;
  esac
  PUBVAL["$n"]="$v"
  ARGS+=(--build-arg "NEXT_PUBLIC_${n}=${v}")
done
rep "NEXT_PUBLIC_* declaradas por el Dockerfile: ${PUB[*]}"
docker buildx build "${BUILD_FLAGS[@]}" -f "$DOCKERFILE" --build-arg "APP=${APP}" "${ARGS[@]}" --load -t "$IMG" . \
  > "$OUT/build-final.log" 2>&1 || { tail -n 60 "$OUT/build-final.log"; fail "falló el build de la imagen final"; exit 1; }
rep "imagen final construida: $IMG"

# 4a. Capas (docker save)
mkdir -p "$WORK/save" "$WORK/layers"
docker save "$IMG" -o "$WORK/img.tar"
tar -xf "$WORK/img.tar" -C "$WORK/save" --no-same-owner --no-same-permissions
chmod -R u+rwX "$WORK/save"
i=0
while IFS= read -r -d '' blob; do
  i=$((i + 1))
  mkdir -p "$WORK/layers/$i"
  tar -xf "$blob" -C "$WORK/layers/$i" --no-same-owner --no-same-permissions 2>/dev/null \
    || tar -xzf "$blob" -C "$WORK/layers/$i" --no-same-owner --no-same-permissions 2>/dev/null \
    || rmdir "$WORK/layers/$i" 2>/dev/null || true
done < <(find "$WORK/save" -type f \( -path '*/blobs/*' -o -name layer.tar \) -print0)
chmod -R u+rwX "$WORK/layers"
rep "capas extraídas: $(find "$WORK/layers" -mindepth 1 -maxdepth 1 | wc -l)"
scan "$WORK/save" "docker save (metadatos y blobs sin extraer)"
scan "$WORK/layers" "capas de la imagen final"
rm -rf "$WORK/layers" "$WORK/save" "$WORK/img.tar"

# 4b. inspect / history
docker inspect "$IMG" > "$OUT/inspect.json"
docker history --no-trunc "$IMG" > "$OUT/history.txt"
scan "$OUT/inspect.json" "docker inspect (Env, Labels, Cmd)"
scan "$OUT/history.txt" "docker history --no-trunc"

# 4c. Export del sistema de archivos (inventario y conteo de valores públicos)
CID="$(docker create "$IMG")"
mkdir -p "$WORK/fs"
docker export "$CID" | tar -x -C "$WORK/fs" --no-same-owner --no-same-permissions 2>/dev/null || true
docker rm "$CID" > /dev/null
chmod -R u+rwX "$WORK/fs"
scan "$WORK/fs" "sistema de archivos exportado"
(cd "$WORK/fs" && find . -type f -print0 | sort -z | xargs -0 sh -c \
  'for f; do printf "%s  %s  %s\n" "$(stat -c %s "$f")" "$(sha256sum < "$f" | cut -d" " -f1)" "$f"; done' _) > "$OUT/imagen-archivos.txt"
rep "archivos en la imagen final: $(wc -l < "$OUT/imagen-archivos.txt")"

# 4d. Valores públicos (CAX-003)
rep "valores NEXT_PUBLIC_* sintéticos: archivos de la imagen donde aparece cada uno"
for n in "${PUB[@]}"; do
  c="$( { grep -rlaF -- "${PUBVAL[$n]}" "$WORK/fs" 2>/dev/null || true; } | wc -l)"
  rep "  NEXT_PUBLIC_${n}: ${c} archivo(s)"
  if [ "$n" = SUPABASE_URL ] && [ "$APP" != api ] && [ "$c" -eq 0 ]; then
    fail "NEXT_PUBLIC_SUPABASE_URL no llegó al bundle de $APP"
  fi
done
rm -rf "$WORK/fs"

# 4e. Usuario, puertos, arranque
rep "usuario efectivo (Config.User): $(docker inspect --format '{{.Config.User}}' "$IMG")"
rep "puertos expuestos: $(docker inspect --format '{{json .Config.ExposedPorts}}' "$IMG")"
rep "entrypoint: $(docker inspect --format '{{json .Config.Entrypoint}}' "$IMG")"
rep "cmd: $(docker inspect --format '{{json .Config.Cmd}}' "$IMG")"

# 4f. Cadena de suministro (CAX-002)
BASE="$(grep -m1 -oE 'node:[^ ]+@sha256:[0-9a-f]{64}' "$DOCKERFILE")"
rep "base fijada en el Dockerfile: $BASE"
docker pull -q "$BASE" > /dev/null 2>&1 || true
rep "RepoDigests de la base: $(docker image inspect --format '{{json .RepoDigests}}' "$BASE" 2>/dev/null || echo 'no disponible')"
rep "Id de la imagen final: $(docker image inspect --format '{{.Id}}' "$IMG")"
if docker run --rm --network none --entrypoint dpkg-query "$IMG" -W > "$OUT/paquetes-dpkg.txt" 2>/dev/null; then
  rep "paquetes dpkg en la imagen: $(wc -l < "$OUT/paquetes-dpkg.txt") (lista en paquetes-dpkg.txt)"
else
  rep "dpkg-query no disponible en la imagen"
fi

if [ "$FAIL" -eq 0 ]; then rep "RESULTADO: OK"; else rep "RESULTADO: FALLO"; fi
exit "$FAIL"
