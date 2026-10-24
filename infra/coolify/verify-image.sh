#!/usr/bin/env bash
# Construye la imagen de una app para Coolify y demuestra con centinelas SINTÉTICOS que ningún secreto llega al contexto
# de build, a la etapa `pruner` ni a la imagen final, y que las NEXT_PUBLIC_* sí llegan al build. Deja un inventario.
# Uso (desde la raíz del repo, con Docker + BuildKit):  bash infra/coolify/verify-image.sh <app> <carpeta-de-salida>
# Los centinelas son inventados: pueden salir en los logs. No usa secretos reales ni sube nada a ningún registro.
# Variable opcional: EXPECTED_SHA (el commit que debía construirse); si está definida y no coincide con HEAD, falla.
set -euo pipefail
export LC_ALL=C

FAIL=0
REPORT=/dev/null
OUT=/dev/null
WORK=/tmp
PAT=/dev/null
RUN_ID="${GITHUB_RUN_ID:-local$$}"
declare -A SENT # valor -> nombre
PLANTED=()

rep() { printf '%s\n' "$*" | tee -a "$REPORT"; }
fail() { FAIL=1; rep "FALLO: $*"; }

# maybe_sudo <comando...>: usa sudo (sin contraseña, como en los runners de GitHub) solo si existe.
maybe_sudo() {
  if [ -z "${NO_SUDO:-}" ] && command -v sudo > /dev/null 2>&1; then sudo -n "$@"; else "$@"; fi
}

plant() { # plant <ruta> <NOMBRE>
  local path="$1" name="$2" value="TNDV_CENTINELA_${2}_${RUN_ID}"
  mkdir -p "$(dirname "$path")"
  printf 'CLAVE=%s\n' "$value" > "$path"
  SENT["$value"]="$name"
  PLANTED+=("$path")
}

# scan <directorio-o-archivo> <etiqueta>: imprime SOLO ruta y nombre del centinela.
# grep: 0 = hubo coincidencias (fallo), 1 = ninguna, >=2 = error de búsqueda (fallo).
scan() {
  local target="$1" label="$2" hits=0 line file val rc=0 safe
  safe="${label//[^A-Za-z0-9]/_}"
  if [ ! -e "$target" ]; then fail "el destino de búsqueda no existe en $label: $target"; return 0; fi
  grep -raoHF -f "$PAT" -r -- "$target" > "$WORK/grep-$safe.out" 2> "$OUT/grep-$safe.err" || rc=$?
  case "$rc" in
    0)
      while IFS= read -r line; do
        file="${line%:*}"
        val="${line##*:}"
        rep "  CENTINELA ENCONTRADO [$label] ${file#"$target"/} -> ${SENT[$val]:-?}"
        hits=$((hits + 1))
      done < <(sort -u "$WORK/grep-$safe.out")
      fail "centinelas en $label: $hits"
      ;;
    1) rep "centinelas en $label: 0/${#SENT[@]}" ;;
    *) fail "error de búsqueda en $label (grep rc=$rc)" ;;
  esac
}

# layer_tar_to_plain <blob> <salida>: deja en <salida> el tar sin comprimir (descomprime o copia).
# Pone el formato en LAYER_FMT. rc != 0 si el formato es desconocido o la descompresión falla.
LAYER_FMT=desconocido
layer_tar_to_plain() {
  local blob="$1" out="$2" magic
  magic="$(head -c 4 "$blob" | od -An -tx1 | tr -d ' \n')"
  case "$magic" in
    1f8b*)
      LAYER_FMT=gzip
      gzip -dc "$blob" > "$out"
      ;;
    28b52ffd)
      LAYER_FMT=zstd
      zstd -dc "$blob" > "$out"
      ;;
    *)
      if tar -tf "$blob" > /dev/null 2>&1; then
        LAYER_FMT=tar
        cp "$blob" "$out"
      else
        LAYER_FMT=desconocido
        return 1
      fi
      ;;
  esac
}

# verify_diffid <tar-sin-comprimir> <sha256:hex>: rc != 0 si el hash no coincide.
verify_diffid() {
  local actual
  actual="sha256:$(sha256sum < "$1" | cut -d' ' -f1)"
  [ "$actual" = "$2" ]
}

# extract_tar <tar> <directorio> <archivo-de-errores>: rc != 0 si tar falla. Con sudo, si existe (mknod/permisos).
extract_tar() {
  mkdir -p "$2"
  maybe_sudo tar -x -f "$1" -C "$2" --no-same-owner 2>> "$3"
}

fix_owner() { maybe_sudo chown -R "$(id -u):$(id -g)" "$1"; }

main() {
  APP="${1:?uso: verify-image.sh <app> <salida>}"
  OUT="$(mkdir -p "${2:?uso: verify-image.sh <app> <salida>}" && cd "$2" && pwd)"
  local ROOT
  ROOT="$(git rev-parse --show-toplevel)"
  cd "$ROOT"
  DOCKERFILE=infra/coolify/next-app.Dockerfile
  IMG="tindivo-${APP}:prueba"
  WORK="$(mktemp -d)"
  trap 'rm -rf "$WORK" 2> /dev/null || maybe_sudo rm -rf "$WORK" || true' EXIT
  REPORT="$OUT/reporte.txt"
  : > "$REPORT"
  PAT="$WORK/patrones.txt"

  local HEAD_SHA
  HEAD_SHA="$(git rev-parse HEAD)"
  rep "app=$APP run_id=$RUN_ID commit=$HEAD_SHA"
  rep "commit esperado (PR head): ${EXPECTED_SHA:-no definido}"
  if [ -n "${EXPECTED_SHA:-}" ] && [ "$EXPECTED_SHA" != "$HEAD_SHA" ]; then
    fail "el commit construido ($HEAD_SHA) no es el esperado ($EXPECTED_SHA)"
  fi
  rep "docker: $(docker --version) | buildx: $(docker buildx version)"

  # ---------- 0. Controles negativos ----------
  # Demuestran que los mecanismos de abajo fallan cuando deben. No marcan el job como fallido si se comportan bien.
  mkdir -p "$WORK/neg/arbol"
  local n
  for n in 1 2 3; do head -c 65536 /dev/urandom > "$WORK/neg/arbol/f$n.bin"; done
  : > "$OUT/capas-tar.err"
  # 1. scan ante una ruta inexistente y ante un error de grep (archivo de patrones ausente) debe acabar en fallo.
  if ( FAIL=0; REPORT="$WORK/neg/rep-1a.txt"; scan "$WORK/neg/no-existe" neg_1a; exit "$FAIL" ) > /dev/null 2>&1; then
    fail "control negativo: scan no detecta un error de búsqueda"
  elif ( FAIL=0; REPORT="$WORK/neg/rep-1b.txt"; PAT="$WORK/neg/no-hay-patrones"; scan "$WORK/neg/arbol" neg_1b; exit "$FAIL" ) > /dev/null 2>&1; then
    fail "control negativo: scan no detecta un error de búsqueda"
  else
    rep "control negativo 1: OK (scan falla ante ruta inexistente y ante grep rc>=2)"
  fi
  # 2. Una extracción truncada debe fallar con la misma función que usan las capas.
  tar -cf "$WORK/neg/ok.tar" -C "$WORK/neg/arbol" .
  head -c "$(($(stat -c %s "$WORK/neg/ok.tar") / 2))" "$WORK/neg/ok.tar" > "$WORK/neg/truncado.tar"
  if ! extract_tar "$WORK/neg/ok.tar" "$WORK/neg/ex-ok" "$WORK/neg/ok.err"; then
    fail "control negativo: el tar válido no se extrae"
  elif extract_tar "$WORK/neg/truncado.tar" "$WORK/neg/ex-trunc" "$WORK/neg/trunc.err"; then
    fail "control negativo: extracción truncada no detectada"
  else
    rep "control negativo 2: OK (el tar truncado falla al extraer)"
  fi
  fix_owner "$WORK/neg"
  # 3. Un diffID esperado falso debe dar «no coincide»; el real debe coincidir.
  if ! verify_diffid "$WORK/neg/ok.tar" "sha256:$(sha256sum < "$WORK/neg/ok.tar" | cut -d' ' -f1)"; then
    fail "control negativo: verify_diffid rechaza el diffID correcto"
  elif verify_diffid "$WORK/neg/ok.tar" "sha256:$(printf '0%.0s' {1..64})"; then
    fail "control negativo: un diffID falso no se detecta"
  else
    rep "control negativo 3: OK (el diffID falso no coincide)"
  fi

  # ---------- 1. Centinelas ----------
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
  printf '%s\n' "${!SENT[@]}" > "$PAT"
  rep "centinelas plantados: ${#SENT[@]} (${#PLANTED[@]} archivos + 1 variable de entorno)"

  # Control positivo del buscador: si nunca encontrara nada, el 0 no probaría nada.
  mkdir "$WORK/control"
  printf 'x%sx' "$SUPABASE_SERVICE_ROLE_KEY" > "$WORK/control/f.bin"
  local rc=0
  grep -raqF -f "$PAT" -r -- "$WORK/control" 2> "$OUT/grep-control.err" || rc=$?
  case "$rc" in
    0) rep "control positivo del buscador: OK" ;;
    1) fail "el buscador no detecta un centinela conocido" ;;
    *) fail "error de búsqueda en el control positivo (grep rc=$rc)" ;;
  esac

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
  local p
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
  local PUB v c
  mapfile -t PUB < <(grep -oE '^ARG NEXT_PUBLIC_[A-Z0-9_]+' "$DOCKERFILE" | sed 's/^ARG NEXT_PUBLIC_//')
  declare -A PUBVAL
  local ARGS=()
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

  # 4a. Capas (docker save): cada capa declarada se descomprime, se verifica contra su diffID y se extrae.
  mkdir -p "$WORK/save" "$WORK/layers" "$WORK/plain"
  docker save "$IMG" -o "$WORK/img.tar" || { fail "docker save falló"; exit 1; }
  tar -xf "$WORK/img.tar" -C "$WORK/save" --no-same-owner --no-same-permissions || { fail "no se pudo extraer el docker save"; exit 1; }
  chmod -R u+rwX "$WORK/save"
  node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
if(!Array.isArray(m)||m.length!==1||!Array.isArray(m[0].Layers)||m[0].Layers.length===0) process.exit(2);
console.log(m[0].Layers.join("\n"))' "$WORK/save/manifest.json" > "$WORK/manifest-capas.txt" \
    || { fail "manifest.json ilegible o con formato inesperado"; exit 1; }
  docker image inspect --format '{{json .RootFS.Layers}}' "$IMG" \
    | node -e 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));
if(!Array.isArray(a)||a.length===0) process.exit(2);
console.log(a.join("\n"))' > "$WORK/diffids.txt" \
    || { fail "RootFS.Layers ilegible"; exit 1; }
  local MLAYERS DIFFS
  mapfile -t MLAYERS < "$WORK/manifest-capas.txt"
  mapfile -t DIFFS < "$WORK/diffids.txt"
  local N=${#MLAYERS[@]}
  if [ "$N" -ne "${#DIFFS[@]}" ]; then
    fail "capas en manifest.json ($N) distinto de RootFS.Layers (${#DIFFS[@]})"
    exit 1
  fi
  : > "$OUT/capas.txt"
  local i blob plain bytes verified=0 extracted=0
  for ((i = 1; i <= N; i++)); do
    blob="$WORK/save/${MLAYERS[i - 1]}"
    plain="$WORK/plain/$i.tar"
    if [ ! -f "$blob" ]; then fail "capa $i: no existe el blob ${MLAYERS[i - 1]}"; continue; fi
    if ! layer_tar_to_plain "$blob" "$plain"; then fail "capa $i: formato no reconocido o descompresión fallida ($LAYER_FMT)"; continue; fi
    bytes="$(stat -c %s "$plain")"
    printf '%s  %s  %s  %s\n' "$i" "${DIFFS[i - 1]}" "$LAYER_FMT" "$bytes" >> "$OUT/capas.txt"
    if verify_diffid "$plain" "${DIFFS[i - 1]}"; then
      verified=$((verified + 1))
    else
      fail "capa $i: diffID no coincide"
      continue
    fi
    if extract_tar "$plain" "$WORK/layers/$i" "$OUT/capas-tar.err"; then
      extracted=$((extracted + 1))
    else
      fail "capa $i: extracción fallida"
    fi
    rm -f "$plain"
  done
  fix_owner "$WORK/layers"
  chmod -R u+rwX "$WORK/layers"
  rep "capas declaradas: $N · diffID verificados: $verified · extraídas: $extracted"
  if [ "$verified" -ne "$N" ] || [ "$extracted" -ne "$N" ]; then fail "no todas las capas declaradas se verificaron y extrajeron"; fi
  scan "$WORK/save" "docker save (metadatos y blobs sin extraer)"
  scan "$WORK/layers" "capas de la imagen final"
  rm -rf "$WORK/layers" "$WORK/save" "$WORK/plain" "$WORK/img.tar"

  # 4b. inspect / history
  docker inspect "$IMG" > "$OUT/inspect.json"
  docker history --no-trunc "$IMG" > "$OUT/history.txt"
  scan "$OUT/inspect.json" "docker inspect (Env, Labels, Cmd)"
  scan "$OUT/history.txt" "docker history --no-trunc"

  # 4c. Export del sistema de archivos (inventario y conteo de valores públicos)
  local CID
  CID="$(docker create "$IMG")"
  mkdir -p "$WORK/fs"
  : > "$OUT/export-tar.err"
  if ! docker export "$CID" > "$WORK/export.tar"; then
    fail "docker export falló"
    docker rm "$CID" > /dev/null
    exit 1
  fi
  docker rm "$CID" > /dev/null
  if extract_tar "$WORK/export.tar" "$WORK/fs" "$OUT/export-tar.err"; then
    fix_owner "$WORK/fs"
  else
    fail "extracción del export fallida"
  fi
  chmod -R u+rwX "$WORK/fs"
  # Los hardlinks (tipo h) se extraen como archivos regulares: se cuentan junto con los archivos regulares.
  local TAR_FILES FS_FILES
  TAR_FILES="$(tar -tvf "$WORK/export.tar" | grep -c '^[-h]' || true)"
  FS_FILES="$(find "$WORK/fs" -type f | wc -l)"
  rep "export: archivos (regulares y enlaces duros) en el tar: $TAR_FILES · archivos regulares extraídos: $FS_FILES"
  if [ "$TAR_FILES" -ne "$FS_FILES" ]; then fail "el export tiene $TAR_FILES archivos y se extrajeron $FS_FILES"; fi
  rm -f "$WORK/export.tar"
  scan "$WORK/fs" "sistema de archivos exportado"
  (cd "$WORK/fs" && find . -type f -print0 | sort -z | xargs -0 sh -c \
    'for f; do printf "%s  %s  %s\n" "$(stat -c %s "$f")" "$(sha256sum < "$f" | cut -d" " -f1)" "$f"; done' _) > "$OUT/imagen-archivos.txt"
  rep "archivos en la imagen final: $(wc -l < "$OUT/imagen-archivos.txt")"

  # 4d. Valores públicos (CAX-003): rc 0 o 1 son válidos; >= 2 es un error de búsqueda.
  rep "valores NEXT_PUBLIC_* sintéticos: archivos de la imagen donde aparece cada uno"
  for n in "${PUB[@]}"; do
    rc=0
    grep -rlaF -- "${PUBVAL[$n]}" "$WORK/fs" > "$WORK/pub-$n.out" 2> "$OUT/grep-publico-$n.err" || rc=$?
    if [ "$rc" -ge 2 ]; then
      fail "error de búsqueda en el conteo de NEXT_PUBLIC_${n} (grep rc=$rc)"
      continue
    fi
    c="$(wc -l < "$WORK/pub-$n.out")"
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
  local BASE
  BASE="$(grep -m1 -oE 'node:[^ ]+@sha256:[0-9a-f]{64}' "$DOCKERFILE")"
  rep "base fijada en el Dockerfile: $BASE"
  docker pull -q "$BASE" > /dev/null 2>&1 || true
  rep "RepoDigests de la base: $(docker image inspect --format '{{json .RepoDigests}}' "$BASE" 2> /dev/null || echo 'no disponible')"
  rep "Id de la imagen final: $(docker image inspect --format '{{.Id}}' "$IMG")"
  if docker run --rm --network none --entrypoint dpkg-query "$IMG" -W > "$OUT/paquetes-dpkg.txt" 2> /dev/null; then
    rep "paquetes dpkg en la imagen: $(wc -l < "$OUT/paquetes-dpkg.txt") (lista en paquetes-dpkg.txt)"
  else
    rep "dpkg-query no disponible en la imagen"
  fi

  if [ "$FAIL" -eq 0 ]; then rep "RESULTADO: OK"; else rep "RESULTADO: FALLO"; fi
  exit "$FAIL"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
