#!/usr/bin/env bash
# Copia de producción P0.5: saca una copia CIFRADA de la base y de los archivos de Storage.
# La configuración externa (Auth, Edge Functions, secretos de la plataforma) NO entra: va en otra entrega, con capturas
# del panel. Por eso el resultado es siempre «COPIA PARCIAL» con ese motivo declarado (código 3).
# Runbook (léelo antes): Docs/operacion/copia-de-produccion.md
#
#   bash scripts/prod-backup/copia.sh --destino prod --commit-firmado <sha> --ca <archivo.crt> [--salida <carpeta>]
#   bash scripts/prod-backup/copia.sh --destino local                       (ensayo contra la base local)
#
# Lo que garantiza, por construcción:
#   - SOLO LECTURA. Contra la base: pg_dump y consultas de lectura (SELECT y SHOW), en sesiones que llegan con
#     default_transaction_read_only=on; conteos, inventario y listado van además en transacciones READ ONLY. Contra Storage: únicamente GET (solo-get.mjs).
#   - NINGÚN ARCHIVO EN CLARO. El dump se arma en la memoria de un contenedor efímero y sale por una tubería
#     directo a gpg. En la carpeta de salida solo quedan archivos .gpg, sus sha256 y registros sin datos personales.
#     Lo que el guion no controla es que Windows pagine esa memoria al disco: por eso contra prod exige que los
#     discos del PC estén cifrados (BitLocker), o que quien lo ejecuta acepte ese riesgo con una opción explícita.
#   - LO QUE FALTA, DICHO. Cada falta (la configuración externa siempre; además, una parte omitida o un archivo de
#     Storage) es un motivo en PARCIAL.txt y en RESUMEN.txt. Con un solo motivo, base y Storage salieron enteros.
#   - LAS CREDENCIALES NO SE GUARDAN. Con --destino prod se escriben a mano en esta terminal (no se ven), viven en
#     la memoria de este proceso y no pasan por argumentos, archivos ni registros.
set -euo pipefail
set +x
umask 077
export LC_ALL=C

# comun.sh se localiza solo con órdenes internas de bash y lo PRIMERO que hace es borrar del entorno toda credencial
# heredada: ningún proceso hijo (ni siquiera `dirname` o `sed`) arranca antes de esa limpieza.
_aqui="${BASH_SOURCE[0]//\\//}" # en Windows la ruta puede llegar con barras invertidas
case "$_aqui" in */*) _aqui="${_aqui%/*}" ;; *) _aqui=. ;; esac
# shellcheck source=scripts/prod-backup/comun.sh
source "$_aqui/comun.sh"

# Las variables de secretos se crean aquí sin atributo de exportación, aunque el entorno trajera uno con ese nombre.
set +a
unset DB_PASS STORAGE_KEY
DESTINO='' SALIDA='' COMMIT_FIRMADO='' ARCHIVO_CA='' SIN_PGOPTIONS=0 DISCO_SIN_CIFRAR=0
DB_PASS='' STORAGE_KEY='' FASE_EN_CURSO=''
MOTIVOS=()
CARPETA_CREADA=0

uso() {
  printf '%s\n' 'Uso:' \
    '  bash scripts/prod-backup/copia.sh --destino prod --commit-firmado <sha> --ca <archivo.crt> [--salida <carpeta>]' \
    '  bash scripts/prod-backup/copia.sh --destino local                       (ensayo contra la base local)' \
    'Runbook: Docs/operacion/copia-de-produccion.md' >&2
  exit 64
}

while [ $# -gt 0 ]; do
  case "$1" in
    --destino) DESTINO="${2:-}"; shift 2 ;;
    --salida) SALIDA="${2:-}"; shift 2 ;;
    --commit-firmado) COMMIT_FIRMADO="${2:-}"; shift 2 ;;
    --ca) ARCHIVO_CA="${2:-}"; shift 2 ;;
    --sin-pgoptions) SIN_PGOPTIONS=1; shift ;;
    --acepto-disco-sin-cifrar) DISCO_SIN_CIFRAR=1; shift ;;
    *) uso ;;
  esac
done
case "$DESTINO" in local | prod) ;; *) uso ;; esac
# Las credenciales de ENSAYO solo valen con --destino local: contra prod se borran antes de lanzar nada.
[ "$DESTINO" != prod ] || unset TINDIVO_COPIA_LOCAL_CLAVE TINDIVO_COPIA_LOCAL_SERVICE_KEY TINDIVO_COPIA_LOCAL_CONTRASENA TINDIVO_COPIA_LOCAL_PUERTO
if [ "$DESTINO" = prod ] && { [ ! -t 0 ] || [ ! -t 2 ]; }; then
  fallo 'con --destino prod hace falta una terminal: ábrelo en tu propia ventana de Git Bash'
fi

# Variables del entorno que cambiarían a dónde habla docker o node, o qué carga node: no se heredan de nadie.
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
unset NODE_OPTIONS NODE_DEBUG NODE_DEBUG_NATIVE NODE_USE_ENV_PROXY NODE_EXTRA_CA_CERTS NODE_TLS_REJECT_UNAUTHORIZED NODE_PATH
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy
unset TINDIVO_SIN_PGOPTIONS TINDIVO_MOSTRAR_CONTEOS TINDIVO_CA_PEM TINDIVO_GUION

limpiar() {
  local rc=$?
  set +e
  DB_PASS='' STORAGE_KEY='' CLAVE=''
  unset PGPASSWORD TINDIVO_STORAGE_KEY
  dk rm -f "$NOMBRE_CONT" >/dev/null 2>&1
  cerrar_gpg
  # Solo se marca la carpeta que creó ESTA corrida: nunca una que ya existía (podría ser una copia buena).
  if [ "$rc" -ne 0 ] && [ "$rc" -ne 3 ] && [ "$CARPETA_CREADA" = 1 ] && [ -d "$SALIDA" ]; then
    [ -z "$FASE_EN_CURSO" ] || rm -f -- "$SALIDA/$FASE_EN_CURSO"
    printf 'La copia NO terminó (UTC %s, código %s). No subas esta carpeta.\n' "$(date -u +%FT%TZ)" "$rc" >"$SALIDA/INCOMPLETA.txt"
    log "La copia NO terminó. Quedó marcada en $SALIDA/INCOMPLETA.txt"
  fi
  exit "$rc"
}
trap limpiar EXIT
trap 'exit 130' INT TERM

# ---------------------------------------------------------------------------------------------------------------
paso "0. Comprobaciones (destino: $DESTINO)"
comprobar_herramientas

RAIZ_REPO="$(git -C "$DIR_GUIONES" rev-parse --show-toplevel)"
COMMIT="$(git -C "$DIR_GUIONES" rev-parse HEAD)"
SUCIO="$(git -C "$RAIZ_REPO" status --porcelain -- scripts/prod-backup)"
log "guiones: commit $COMMIT${SUCIO:+ (con cambios sin commit)}"
log "imagen:  $IMAGEN_PG"

if [ "$DESTINO" = prod ]; then
  [ -z "$SUCIO" ] || fallo 'hay cambios sin commit en scripts/prod-backup: contra prod solo corre lo que firmó Codex'
  [ "${#COMMIT_FIRMADO}" -ge 12 ] || fallo 'falta --commit-firmado <sha> (al menos 12 caracteres del commit que firmó Codex)'
  [ "${COMMIT#"$COMMIT_FIRMADO"}" != "$COMMIT" ] || fallo "este checkout está en $COMMIT y no en el commit firmado $COMMIT_FIRMADO"
  [ "$IMAGEN_PG" = "$IMAGEN_PG_FIJADA" ] || fallo 'contra prod solo se usa la imagen fijada (quita TINDIVO_COPIA_IMAGEN)'
  # La contraseña entra a un contenedor: el motor de Docker tiene que ser el de este PC, no uno remoto.
  MOTOR="$(dk context inspect --format '{{.Endpoints.docker.Host}}')"
  case "$MOTOR" in npipe://* | unix://*) ;; *) fallo "el contexto de Docker apunta a «$MOTOR»: usa el Docker local de este PC" ;; esac
  # La identidad del servidor se comprueba siempre: sin el certificado de la CA no hay copia.
  [ -n "$ARCHIVO_CA" ] || fallo 'contra prod hace falta --ca <certificado de la CA de Supabase> (panel: Database → Settings → SSL Configuration)'
  # La memoria puede acabar en el archivo de paginación de Windows: los discos tienen que estar cifrados.
  DISCOS="$(discos_bitlocker)"
  DISCO='cifrado (BitLocker activo en todos los discos fijos)'
  if [ -z "$DISCOS" ] || [ -n "$(printf '%s\n' $DISCOS | grep -v '^[A-Z]=1$')" ]; then
    [ "$DISCO_SIN_CIFRAR" = 1 ] || fallo "no se pudo acreditar que los discos estén cifrados con BitLocker (${DISCOS:-sin respuesta}; 1 = activo). Actívalo, o repite con --acepto-disco-sin-cifrar si Jesús acepta que la memoria paginada pueda quedar en claro en el disco"
    DISCO="NO acreditado (${DISCOS:-sin respuesta}); riesgo aceptado con --acepto-disco-sin-cifrar"
  fi
  log "discos:  $DISCO"
  # Nivel B: nunca de 18:00 a 23:00, hora de Lima (plan-diario.md §1). Lima es UTC-5 todo el año.
  HORA_LIMA=$(((10#$(date -u +%H) + 19) % 24))
  if [ "$HORA_LIMA" -ge 18 ] && [ "$HORA_LIMA" -lt 23 ]; then
    fallo "son las $HORA_LIMA h en Lima: de 18:00 a 23:00 no se toca producción"
  fi
  # Lo que haya en el entorno no se usa: las credenciales de prod solo entran por el teclado.
  unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE PGOPTIONS PGREQUIREAUTH PGSERVICE PGSERVICEFILE PGPASSFILE PGSSLMODE DATABASE_URL
  unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_SERVICE_ROLE_KEY TINDIVO_STORAGE_KEY
  unset TINDIVO_COPIA_LOCAL_CLAVE TINDIVO_COPIA_LOCAL_SERVICE_KEY TINDIVO_COPIA_LOCAL_CONTRASENA TINDIVO_COPIA_LOCAL_PUERTO
fi

if [ -n "$ARCHIVO_CA" ]; then
  [ -s "$ARCHIVO_CA" ] || fallo "no existe el certificado $ARCHIVO_CA"
  grep -q 'BEGIN CERTIFICATE' "$ARCHIVO_CA" || fallo "$ARCHIVO_CA no es un certificado PEM"
  TINDIVO_CA_PEM="$(cat "$ARCHIVO_CA")"
  export TINDIVO_CA_PEM
fi

SELLO="$(date -u +%Y%m%dT%H%M%SZ)"
[ -n "$SALIDA" ] || SALIDA="$HOME/tindivo-copias/$DESTINO-$SELLO"
case "$SALIDA" in */scratch/* | */scratch) fallo 'la copia no va en scratch/' ;; esac
[ ! -e "$SALIDA" ] || fallo "ya existe $SALIDA: elige una carpeta nueva"
PADRE="$(dirname "$SALIDA")"
mkdir -p "$PADRE"
if [ "$(git -C "$PADRE" rev-parse --is-inside-work-tree 2>/dev/null || true)" = true ]; then
  fallo "la carpeta de salida está dentro de un repositorio git ($PADRE): la copia nunca entra a un repo"
fi

# ---------------------------------------------------------------------------------------------------------------
paso '1. Datos de conexión'
export PGDATABASE=postgres PGCONNECT_TIMEOUT=20 PGAPPNAME=tindivo-copia-p05
if [ "$DESTINO" = local ]; then
  export PGHOST=host.docker.internal PGPORT="${TINDIVO_COPIA_LOCAL_PUERTO:-54322}" PGUSER=postgres PGSSLMODE=disable
  DB_PASS="${TINDIVO_COPIA_LOCAL_CONTRASENA:-postgres}"
  STORAGE_URL='http://127.0.0.1:54321'
  STORAGE_KEY="${TINDIVO_COPIA_LOCAL_SERVICE_KEY:-}"
  [ "${TINDIVO_COPIA_LOCAL_SCRAM:-0}" != 1 ] || export PGREQUIREAUTH=scram-sha-256
  log "base local: $PGHOST:$PGPORT"
else
  log 'En el panel de Supabase de tindivo-prod: Connect → «Session pooler». Copia host y usuario tal cual.'
  pedir_visible 'Host (termina en .pooler.supabase.com): ' PGHOST ''
  pedir_visible 'Puerto [5432]: ' PGPORT 5432
  pedir_visible "Usuario [postgres.$REF_PROD]: " PGUSER "postgres.$REF_PROD"
  # PGREQUIREAUTH: libpq solo acepta SCRAM, así un intermediario no puede pedir la contraseña en claro.
  export PGHOST PGPORT PGUSER PGSSLMODE=verify-full PGREQUIREAUTH=scram-sha-256
  case "$PGHOST$PGUSER" in *"$REF_ABANDONADO"*) fallo 'ese es el proyecto abandonado: nunca se usa' ;; esac
  if [[ "$PGHOST" =~ ^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$ ]]; then
    [ "$PGUSER" = "postgres.$REF_PROD" ] || fallo "por el pooler el usuario debe ser postgres.$REF_PROD"
  elif [ "$PGHOST" = "db.$REF_PROD.supabase.co" ]; then
    [ "$PGUSER" = postgres ] || fallo 'por la conexión directa el usuario debe ser postgres'
  else
    fallo "«$PGHOST» no es el pooler de Supabase ni la base de tindivo-prod"
  fi
  [ "$PGPORT" = 5432 ] || fallo 'el puerto debe ser 5432 (modo sesión); el 6543 es modo transacción y no sirve para pg_dump'
  pedir_oculto 'Contraseña de la base (no se ve al escribir): ' DB_PASS
  [ -n "$DB_PASS" ] || fallo 'la contraseña no puede estar vacía'
  STORAGE_URL="$URL_PROD"
  log 'Archivos de Storage: hace falta la clave service_role (panel → Settings → API Keys). Enter para dejarlos para otra pasada.'
  pedir_oculto 'service_role (no se ve; Enter = omitir): ' STORAGE_KEY
fi
if [ "$SIN_PGOPTIONS" = 1 ]; then
  export TINDIVO_SIN_PGOPTIONS=1
  unset PGOPTIONS
  log 'aviso: --sin-pgoptions. La sesión no lleva default_transaction_read_only; quedan las transacciones READ ONLY del snapshot (psql) y de pg_dump; las consultas sueltas son SELECT y SHOW.'
else
  export PGOPTIONS='-c default_transaction_read_only=on'
fi

paso '2. Clave de cifrado'
log "La clave la eliges y la guardas SOLO tú (mínimo $CLAVE_MINIMO caracteres). Sin ella la copia no se puede abrir: no hay recuperación."
preparar_gpg
if [ "$DESTINO" = local ]; then pedir_clave confirmar 1; else pedir_clave confirmar 0; fi

if [ "$DESTINO" = prod ]; then
  paso '3. Confirmación'
  log "Se va a LEER tindivo-prod ($PGHOST:$PGPORT, usuario $PGUSER) y a escribir la copia cifrada en:"
  log "  $SALIDA"
  log "Partes: base = sí · archivos de Storage = $([ -n "$STORAGE_KEY" ] && echo sí || echo no) · configuración externa = no (otra entrega)"
  CONFIRMA=''
  pedir_visible 'Escribe COPIAR tindivo-prod para seguir: ' CONFIRMA ''
  [ "$CONFIRMA" = 'COPIAR tindivo-prod' ] || fallo 'no se confirmó: no se hizo nada'
fi

mkdir "$SALIDA"
CARPETA_CREADA=1
INICIO=$(date +%s)

# ---------------------------------------------------------------------------------------------------------------
paso 'Parte 1 de 2 · Base: roles, esquema, permisos, datos de public/auth/storage, conteos e inventario'
FASE_EN_CURSO='1-base.tar.gpg'
{ printf '%s\n' "$DB_PASS" | contenedor bridge copiar 2>&1 1>&3 | tee "$SALIDA/1-base.copia.log" >&2; } 3>&1 |
  cifrar >"$SALIDA/1-base.tar.gpg"
M1="$(manifiesto_de "$SALIDA/1-base.copia.log")"
[ -n "$M1" ] || fallo 'la parte 1 no entregó su manifiesto'
log 'cifrada. Ahora se descifra hacia la memoria y se comprueba…'
verificar_base "$SALIDA/1-base.tar.gpg" "$SALIDA/1-base.verificacion.log"
[ "$(manifiesto_de "$SALIDA/1-base.verificacion.log")" = "$M1" ] || fallo 'el manifiesto descifrado no es el que se cifró'
FASE_EN_CURSO=''
ESTADO_1="OK · manifiesto $M1"
log "Parte 1: $ESTADO_1"

# ---------------------------------------------------------------------------------------------------------------
DB_PASS=''
paso 'Parte 2 de 2 · Archivos de Storage'
ESTADO_2='OMITIDA (sin clave service_role): los archivos de Storage NO están en esta copia'
if [ -z "$STORAGE_KEY" ]; then
  MOTIVOS+=('parte 2 omitida: los archivos de Storage no están en la copia')
else
  FASE_EN_CURSO='2-storage.tar.gpg'
  # La lista de objetos es la que la parte 1 tomó en su snapshot: se saca de 1-base.tar.gpg, descifrado hacia una
  # tubería. La clave service_role viaja en el entorno de node y de nadie más (ni tee, ni tar, ni gpg).
  {
    descifrar <"$SALIDA/1-base.tar.gpg" | tar -xOf - ./storage-objetos.jsonl |
      TINDIVO_STORAGE_KEY="$STORAGE_KEY" node "$DIR_GUIONES/storage-tar.mjs" "$DESTINO" "$STORAGE_URL" 2>&1 1>&3 |
      tee "$SALIDA/2-storage.copia.log" >&2
  } 3>&1 | cifrar >"$SALIDA/2-storage.tar.gpg"
  M2="$(manifiesto_de "$SALIDA/2-storage.copia.log")"
  [ -n "$M2" ] || fallo 'la parte 2 no entregó su manifiesto'
  verificar_tar_node "$SALIDA/2-storage.tar.gpg" "$SALIDA/2-storage.verificacion.log"
  [ "$(manifiesto_de "$SALIDA/2-storage.verificacion.log")" = "$M2" ] || fallo 'el manifiesto de Storage descifrado no es el que se cifró'
  FASE_EN_CURSO=''
  E2="$(estado_de "$SALIDA/2-storage.copia.log")"
  [ "$E2" = "$(estado_de "$SALIDA/2-storage.verificacion.log")" ] || fallo 'el estado de Storage descifrado no es el que se anotó'
  case "$E2" in
    COMPLETA) ;;
    PARCIAL) MOTIVOS+=('parte 2 parcial: hay archivos de Storage que no se pudieron bajar o que no miden lo que dice la base') ;;
    *) fallo 'la parte 2 no dijo si quedó completa' ;;
  esac
  ESTADO_2="$E2 · $(grep -o 'RESUMEN .*' "$SALIDA/2-storage.copia.log" | tail -n 1) · manifiesto $M2"
fi
log "Parte 2: $ESTADO_2"
STORAGE_KEY=''

# ---------------------------------------------------------------------------------------------------------------
# La configuración externa no forma parte de esta copia (decisión de Jesús, 2026-11-26): se declara, no se calla.
ESTADO_3='NO INCLUIDA: la configuración de Auth y de Edge Functions va en otra entrega, con capturas del panel'
MOTIVOS+=('sin configuración externa (Auth, Edge Functions): no entra en esta copia; va en otra entrega')

# ---------------------------------------------------------------------------------------------------------------
paso 'Cierre: sha256, resumen y comprobación de que no quedó nada en claro'
CLAVE=''
cerrar_gpg
(cd "$SALIDA" && sha256sum -b -- *.tar.gpg >SHA256SUMS)
# Siempre hay al menos un motivo (la configuración externa): la copia es PARCIAL por diseño.
RESULTADO='COPIA PARCIAL'
{
  echo "COPIA PARCIAL (UTC $SELLO). Sirve como copia de lo que sí lleva; NO cierra P0.5. Motivos:"
  printf -- '- %s\n' "${MOTIVOS[@]}"
} >"$SALIDA/PARCIAL.txt"
{
  echo 'COPIA DE PRODUCCIÓN P0.5 · RESUMEN (sin datos personales ni secretos)'
  echo "RESULTADO:      $RESULTADO"
  printf -- '                - %s\n' "${MOTIVOS[@]}"
  echo "destino:        $DESTINO ($PGHOST:$PGPORT, usuario $PGUSER)"
  echo "tomada (UTC):   $SELLO · duración $(($(date +%s) - INICIO)) s"
  echo "guiones:        commit $COMMIT${SUCIO:+ (con cambios sin commit)}"
  echo "imagen:         $IMAGEN_PG"
  echo "cifrado:        gpg simétrico, AES-256, S2K iterado con SHA-512 ($(gpg --version | head -n 1))"
  echo "TLS:            $([ -n "${TINDIVO_CA_PEM:-}" ] && echo 'verify-full con la CA indicada' || echo "$PGSSLMODE")"
  echo "discos:         ${DISCO:-no se comprueba con --destino local}"
  echo "solo lectura:   $([ "$SIN_PGOPTIONS" = 1 ] && echo 'transacciones READ ONLY del snapshot y del listado (sin PGOPTIONS)' || echo 'default_transaction_read_only=on en toda sesión + transacciones READ ONLY')"
  echo "parte 1 base:   $ESTADO_1"
  echo "                $(grep -o 'RESUMEN .*' "$SALIDA/1-base.copia.log" | tail -n 1)"
  echo "parte 2 storage: $ESTADO_2"
  echo "configuración:  $ESTADO_3"
  echo
  echo 'sha256 de los archivos cifrados (también en SHA256SUMS):'
  cat "$SALIDA/SHA256SUMS"
} >"$SALIDA/RESUMEN.txt"

# Solo puede haber archivos cifrados, sus sumas, el resumen y los registros.
SOBRAN="$(find "$SALIDA" -mindepth 1 ! -name '*.tar.gpg' ! -name '*.log' ! -name SHA256SUMS ! -name RESUMEN.txt ! -name PARCIAL.txt)"
[ -z "$SOBRAN" ] || fallo "hay archivos inesperados en la salida: $SOBRAN"
for f in "$SALIDA"/*.tar.gpg; do
  [ "$(head -c 2 "$f" | od -An -tx1 | tr -d ' \n')" = 8c0d ] || fallo "$f no empieza como un archivo cifrado de gpg"
done
sin_contenedores_vivos || fallo 'quedó un contenedor de la copia sin borrar: docker ps -a --filter label=tindivo-copia'
log 'No quedó ningún archivo en claro: el dump vivió en la memoria de un contenedor que ya no existe.'

cat "$SALIDA/RESUMEN.txt" >&2
log "Carpeta: $SALIDA"
if [ "${#MOTIVOS[@]}" -eq 1 ]; then
  paso 'LISTO: COPIA PARCIAL ESPERADA. Base y Storage enteros y verificados; solo falta la configuración externa (otra entrega).'
  log 'Sigue el runbook: sube la carpeta entera a tu Google Drive y comprueba el sha256 después de subirla.'
else
  paso "COPIA PARCIAL CON FALTAS: además de la configuración externa, faltan $((${#MOTIVOS[@]} - 1)) cosa(s). Lee PARCIAL.txt."
fi
exit 3
