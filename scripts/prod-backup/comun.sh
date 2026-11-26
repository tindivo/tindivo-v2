# shellcheck shell=bash
# Copia de producción P0.5: funciones que comparten copia.sh y verificar.sh. Se carga con `source`.
# Runbook: Docs/operacion/copia-de-produccion.md

# --- Lo primero, antes de cualquier proceso hijo: el entorno se reduce a una lista de variables PERMITIDAS ---------
# No se enumeran las credenciales que podrían venir exportadas (siempre faltaría alguna): se quita del entorno TODO lo
# que no haga falta para que arranquen bash, git, docker, gpg, node y powershell. La lista lleva NOMBRES EXACTOS, sin
# prefijos ni comodines: una variable BASH_LO_QUE_SEA o MSYSTEM_LO_QUE_SEA exportada también se quita. Solo órdenes
# internas de bash y /usr/bin/env (capa 1): ningún otro programa arranca antes de terminar la limpieza.
set +a
_permitida() {
  case "$1" in
    PATH | HOME | USER | USERNAME | LOGNAME | USERPROFILE | USERDOMAIN | COMPUTERNAME | HOSTNAME | SHELL | PWD | OLDPWD | SHLVL | _) return 0 ;;
    TEMP | TMP | TMPDIR | LANG | LANGUAGE | LC_ALL | LC_CTYPE | TERM | TZ | CI) return 0 ;;
    SYSTEMROOT | SystemRoot | WINDIR | windir | COMSPEC | ComSpec | PATHEXT | OS | SYSTEMDRIVE | SystemDrive | HOMEDRIVE | HOMEPATH) return 0 ;;
    APPDATA | LOCALAPPDATA | PROGRAMDATA | ProgramData | ALLUSERSPROFILE | PUBLIC | PROGRAMFILES | ProgramFiles | ProgramW6432 | PSModulePath) return 0 ;;
    CommonProgramFiles | CommonProgramW6432 | NUMBER_OF_PROCESSORS | PROCESSOR_ARCHITECTURE | PROCESSOR_IDENTIFIER) return 0 ;;
    MSYSTEM | MSYSTEM_CARCH | MSYSTEM_CHOST | MSYSTEM_PREFIX | MSYS | MSYS2_PATH_TYPE | MINGW_PREFIX | MINGW_CHOST | MINGW_PACKAGE_PREFIX) return 0 ;;
    EXEPATH | ORIGINAL_PATH) return 0 ;;
    TINDIVO_COPIA_IMAGEN | TINDIVO_COPIA_TMPFS_MB | TINDIVO_COPIA_LOCAL_CLAVE | TINDIVO_COPIA_LOCAL_SERVICE_KEY) return 0 ;;
    TINDIVO_COPIA_LOCAL_CONTRASENA | TINDIVO_COPIA_LOCAL_PUERTO | TINDIVO_COPIA_LOCAL_SCRAM) return 0 ;;
  esac
  return 1
}
_nombres() { # escribe en _N los nombres de todas las variables (bash solo ve las de nombre válido)
  _N=("${!A@}" "${!B@}" "${!C@}" "${!D@}" "${!E@}" "${!F@}" "${!G@}" "${!H@}" "${!I@}" "${!J@}" "${!K@}" "${!L@}" "${!M@}"
    "${!N@}" "${!O@}" "${!P@}" "${!Q@}" "${!R@}" "${!S@}" "${!T@}" "${!U@}" "${!V@}" "${!W@}" "${!X@}" "${!Y@}" "${!Z@}"
    "${!a@}" "${!b@}" "${!c@}" "${!d@}" "${!e@}" "${!f@}" "${!g@}" "${!h@}" "${!i@}" "${!j@}" "${!k@}" "${!l@}" "${!m@}"
    "${!n@}" "${!o@}" "${!p@}" "${!q@}" "${!r@}" "${!s@}" "${!t@}" "${!u@}" "${!v@}" "${!w@}" "${!x@}" "${!y@}" "${!z@}" "${!_@}")
}
# Capa 1: el guion se relanza a sí mismo con `env -i` y SOLO las variables permitidas. Es la única forma de quitar las
# entradas del entorno cuyo nombre no es válido para bash (`MI-TOKEN`, `npm_config_//registro/:_authToken`…): bash
# no las ve ni las puede borrar, pero las pasaría tal cual a cada hijo. Antes del relanzamiento no arranca ningún
# programa salvo /usr/bin/env, que no reenvía nada fuera de lo que recibe en sus argumentos. `exec` conserva el PID:
# la marca vale el PID, así que una marca heredada del entorno no sirve para saltarse este paso.
_relanzar_limpio() {
  local - _n _a=()
  set +u
  _nombres
  for _n in "${_N[@]}"; do
    case "$_n" in '' | _n | _a | _N | _GUION | _TINDIVO_LIMPIO) continue ;; esac
    if [[ "${!_n@a}" == *x* ]] && _permitida "$_n"; then _a+=("$_n=${!_n}"); fi
  done
  exec /usr/bin/env -i "${_a[@]}" _TINDIVO_LIMPIO="$$" "$BASH" "$_GUION" "$@"
}
# El guion que cargó este archivo es el que se relanza. Si no lo cargó un archivo (bash -c, terminal), no se sigue.
_GUION="${BASH_SOURCE[1]:-}"
if [ -z "$_GUION" ] || [ ! -f "$_GUION" ]; then
  echo 'comun.sh solo se carga desde un guion (copia.sh, verificar.sh)' >&2
  exit 64
fi
[ "${_TINDIVO_LIMPIO:-}" = "$$" ] || _relanzar_limpio "$@"
unset _TINDIVO_LIMPIO _N _GUION
# Capa 2: lo que el propio bash haya creado o importado al arrancar se vuelve a filtrar, y se comprueba.
_exportadas() { # escribe en _X los nombres de todas las variables exportadas que no están en la lista
  # `local -` devuelve las opciones al salir; sin -u, ${!_n@a} no falla con las declaradas sin valor (BASH_ARGV…).
  local - _n
  set +u
  _X=()
  _nombres
  for _n in "${_N[@]}"; do
    case "$_n" in '' | _n | _X | _N) continue ;; esac
    # Solo interesan las exportadas (las que heredaría un hijo); el atributo se lee sin lanzar nada.
    [[ "${!_n@a}" == *x* ]] || continue
    _permitida "$_n" || _X+=("$_n")
  done
}
_exportadas
for _v in "${_X[@]}"; do
  # Las de solo lectura (BASHOPTS, por ejemplo, si vino del entorno) no se pueden borrar, pero sí dejar de exportar.
  unset "$_v" 2>/dev/null || export -n "$_v" 2>/dev/null || true
done
# Las funciones exportadas viajan a los hijos como variables BASH_FUNC_<nombre>%%: se borran todas. En este punto
# no debería quedar ninguna (env -i no las pasa); esto es la segunda capa. La subcapa de <( ) es bash, sin programas.
while read -r _ _ _v; do
  case "$_v" in _permitida | _exportadas) export -nf "$_v" 2>/dev/null || true ;; *) unset -f "$_v" 2>/dev/null || export -nf "$_v" 2>/dev/null || true ;; esac
done < <(declare -F -x)
# Y se comprueba: si queda una sola variable o función exportada fuera de la lista, el guion no sigue.
_exportadas
_F=''
while read -r _ _ _v; do _F="$_F $_v"; done < <(declare -F -x)
if [ "${#_X[@]}" -gt 0 ] || [ -n "$_F" ]; then
  printf 'ERROR: no se pudo limpiar el entorno: siguen exportadas %s%s\n' "${_X[*]}" "${_F:+ (funciones:$_F)}" >&2
  exit 70
fi
unset _X _F _v
# Los nombres que el guion usa para sus secretos nacen sin atributo de exportación.
unset DB_PASS STORAGE_KEY CLAVE GNUPG_TMP
# ------------------------------------------------------------------------------------------------------------------

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
DIR_GUIONES="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
NOMBRE_CONT="tindivo-copia-$$"
# Las variables que guardan secretos nacen aquí, sin atributo de exportación aunque el entorno trajera uno.
set +a
unset GNUPG_TMP CLAVE
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

estado_de() { grep -o 'ESTADO=[A-Z]*' "$1" | tail -n 1 | cut -d= -f2; }

# Estado de BitLocker de cada disco fijo, como «C=1 D=1» (1 = cifrado y activo). Vacío si no se puede saber.
discos_bitlocker() {
  command -v powershell.exe >/dev/null 2>&1 || return 0
  powershell.exe -NoProfile -NonInteractive -Command "\$s = New-Object -ComObject Shell.Application; [System.IO.DriveInfo]::GetDrives() | Where-Object { \$_.DriveType -eq [System.IO.DriveType]::Fixed } | ForEach-Object { \$l = \$_.Name.Substring(0, 2); \$l.Substring(0, 1) + [char]61 + \$s.NameSpace(\$l).Self.ExtendedProperty('System.Volume.BitLockerProtection') }" 2>/dev/null | tr -d '\r' | tr '\n' ' ' || true
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
