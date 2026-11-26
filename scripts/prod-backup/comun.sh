# shellcheck shell=bash
# Copia de producción P0.5: funciones que comparten copia.sh y verificar.sh. Se carga con `source`.
# Runbook: Docs/operacion/copia-de-produccion.md

REF_PROD='zpnipajgwfthxhdtzhly'
REF_ABANDONADO='psjigdoinfpgrnedxeyf'
URL_PROD="https://${REF_PROD}.supabase.co"
# La misma imagen que usa la base local (Postgres 17.6: pg_dump, pg_restore, psql), fijada por digest.
IMAGEN_PG_FIJADA='public.ecr.aws/supabase/postgres@sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453'
IMAGEN_PG="${TINDIVO_COPIA_IMAGEN:-$IMAGEN_PG_FIJADA}"
TMPFS_MB="${TINDIVO_COPIA_TMPFS_MB:-2048}"
[[ "$TMPFS_MB" =~ ^[0-9]{3,5}$ ]] || {
  printf 'TINDIVO_COPIA_TMPFS_MB debe ser un número de MB (de 100 a 99999)\n' >&2
  exit 64
}
CLAVE_MINIMO=20
DIR_GUIONES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NOMBRE_CONT="tindivo-copia-$$"
GNUPG_TMP=''
CLAVE=''

log() { printf '%s\n' "$*" >&2; }
paso() { printf '\n== %s\n' "$*" >&2; }
fallo() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

# Git Bash convierte los argumentos que parecen rutas (/work → C:/Program Files/Git/work): se apaga solo para docker.
dk() { MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' docker "$@"; }

comprobar_herramientas() {
  local h
  for h in docker gpg node sha256sum tar git; do
    command -v "$h" >/dev/null 2>&1 || fallo "falta «$h» en el PATH (abre Git Bash; mira «Antes de empezar» en el runbook)"
  done
  dk info >/dev/null 2>&1 || fallo 'Docker no responde: abre Docker Desktop y espera a que arranque'
  dk image inspect "$IMAGEN_PG" >/dev/null 2>&1 || fallo "falta la imagen de Postgres. Bájala con: docker pull $IMAGEN_PG"
  local mayor
  mayor="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$mayor" -ge 20 ] || fallo "hace falta Node 20 o más nuevo (hay $mayor)"
}

# Lanza el guion de en-contenedor.sh en un contenedor efímero, sin disco: raíz de solo lectura y /work en memoria.
# Uso: contenedor <none|bridge> <modo>. La entrada estándar pasa al guion (contraseña o tar).
contenedor() {
  local red="$1" modo="$2" extra=()
  [ "$red" = bridge ] && extra=(--add-host=host.docker.internal:host-gateway)
  (
    TINDIVO_GUION="$(cat "$DIR_GUIONES/en-contenedor.sh")"
    # Windows no admite variables de entorno de más de 32 767 caracteres.
    [ "${#TINDIVO_GUION}" -lt 30000 ] || fallo 'en-contenedor.sh creció demasiado para viajar en una variable'
    export TINDIVO_GUION
    dk run --rm -i --name "$NOMBRE_CONT" --label tindivo-copia=1 --network "$red" "${extra[@]}" \
      --read-only --tmpfs "/work:rw,size=${TMPFS_MB}m,mode=1777" --tmpfs /tmp:rw,size=16m,mode=1777 \
      --memory "$((TMPFS_MB + 1024))m" --memory-swap "$((TMPFS_MB + 1024))m" \
      --cap-drop ALL --security-opt no-new-privileges --user 65534:65534 -e HOME=/work \
      -e TINDIVO_GUION -e TINDIVO_SIN_PGOPTIONS -e TINDIVO_MOSTRAR_CONTEOS -e TINDIVO_CA_PEM \
      -e PGHOST -e PGPORT -e PGUSER -e PGDATABASE -e PGSSLMODE -e PGOPTIONS -e PGCONNECT_TIMEOUT -e PGAPPNAME -e PGREQUIREAUTH \
      --entrypoint bash "$IMAGEN_PG" -c 'eval "$TINDIVO_GUION"' guion "$modo"
  )
}

preparar_gpg() {
  GNUPG_TMP="$(mktemp -d)"
  chmod 700 "$GNUPG_TMP"
}

cerrar_gpg() {
  [ -n "$GNUPG_TMP" ] || return 0
  gpgconf --homedir "$GNUPG_TMP" --kill gpg-agent >/dev/null 2>&1 || true
  rm -rf -- "$GNUPG_TMP"
  GNUPG_TMP=''
}

# La clave entra a gpg por un descriptor (una tubería), nunca por argumentos ni por un archivo.
gpg_base() {
  gpg --homedir "$GNUPG_TMP" --batch --quiet --no-tty --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 "$@" \
    3< <(printf '%s' "$CLAVE")
}

# stdin en claro → stdout cifrado (AES-256, clave derivada con SHA-512 iterado; sin compresión: el dump ya va comprimido).
cifrar() {
  gpg_base --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
    --compress-algo none --output -
}

# stdin cifrado → stdout en claro. Solo se usa hacia una tubería, nunca hacia un archivo.
descifrar() { gpg_base --decrypt --output -; }

pedir_visible() { # texto, variable, valor por defecto
  local r=''
  IFS= read -r -p "$1" r </dev/tty
  [ -n "$r" ] || r="${3:-}"
  printf -v "$2" '%s' "$r"
}

pedir_oculto() { # texto, variable
  local r=''
  IFS= read -rs -p "$1" r </dev/tty
  printf '\n' >&2
  printf -v "$2" '%s' "$r"
}

validar_clave() {
  local LC_ALL=C # los rangos de caracteres dependen del locale: se fija para que « -~» sea ASCII imprimible
  [ "${#1}" -ge "$CLAVE_MINIMO" ] || {
    log "La clave debe tener al menos $CLAVE_MINIMO caracteres."
    return 1
  }
  [[ "$1" =~ ^[\ -~]+$ ]] || {
    log 'La clave solo puede llevar letras sin tilde, números, espacios y signos del teclado inglés (así se escribe igual en cualquier equipo).'
    return 1
  }
  [[ "$1" != ' '* && "$1" != *' ' ]] || {
    log 'La clave no puede empezar ni terminar con un espacio.'
    return 1
  }
}

# Pide la clave de cifrado. Con «confirmar» la pide dos veces. Fuera de prod acepta TINDIVO_COPIA_LOCAL_CLAVE (pruebas).
pedir_clave() { # confirmar|una, permitir_variable(0|1)
  local otra=''
  if [ "$2" = 1 ] && [ -n "${TINDIVO_COPIA_LOCAL_CLAVE:-}" ]; then
    CLAVE="$TINDIVO_COPIA_LOCAL_CLAVE"
    validar_clave "$CLAVE" || fallo 'TINDIVO_COPIA_LOCAL_CLAVE no cumple las reglas de la clave'
    return 0
  fi
  [ -t 0 ] || fallo 'hace falta una terminal para escribir la clave'
  while true; do
    pedir_oculto 'Clave de cifrado (no se ve al escribir): ' CLAVE
    validar_clave "$CLAVE" || continue
    [ "$1" = confirmar ] || break
    pedir_oculto 'Repite la clave: ' otra
    [ "$CLAVE" = "$otra" ] && break
    log 'No coinciden. Otra vez.'
  done
}

manifiesto_de() { grep -o 'MANIFEST_SHA256=[0-9a-f]\{64\}' "$1" | tail -n 1 | cut -d= -f2; }

# Descifra hacia una tubería y comprueba la parte 1 dentro de un contenedor sin red. Deja el registro en $2.
verificar_base() { # archivo cifrado, registro
  descifrar <"$1" | contenedor none verificar 2>&1 | tee "$2" >&2
}

# Descifra hacia una tubería y comprueba un tar de Storage o de configuración (manifiesto y sha256 de cada entrada).
verificar_tar_node() { # archivo cifrado, registro
  descifrar <"$1" | node "$DIR_GUIONES/verificar-tar.mjs" 2>&1 | tee "$2" >&2
}

sin_contenedores_vivos() {
  [ -z "$(dk ps -a -q --filter label=tindivo-copia)" ]
}
