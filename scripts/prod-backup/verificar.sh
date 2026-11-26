#!/usr/bin/env bash
# Copia de producción P0.5: comprueba una copia ya hecha (por ejemplo, recién bajada de Google Drive).
# Runbook: Docs/operacion/copia-de-produccion.md
#
#   bash scripts/prod-backup/verificar.sh <carpeta-de-la-copia> [--conteos]
#
# No se conecta a ninguna base ni a internet. Comprueba el sha256 de cada archivo cifrado, lo descifra hacia la
# memoria (nunca a un archivo) y revisa el contenido: manifiesto interno, y que pg_restore lee el dump entero.
# Con --conteos imprime además las filas por tabla que quedaron anotadas al sacar la copia.
set -euo pipefail
set +x
set +a
umask 077
export LC_ALL=C

unset NODE_OPTIONS NODE_DEBUG NODE_DEBUG_NATIVE NODE_PATH DOCKER_HOST DOCKER_CONTEXT TINDIVO_GUION TINDIVO_SIN_PGOPTIONS

# comun.sh se localiza solo con órdenes internas de bash y lo PRIMERO que hace es borrar del entorno toda credencial
# heredada: ningún proceso hijo (ni siquiera `dirname` o `sed`) arranca antes de esa limpieza.
_aqui="${BASH_SOURCE[0]//\\//}" # en Windows la ruta puede llegar con barras invertidas
case "$_aqui" in */*) _aqui="${_aqui%/*}" ;; *) _aqui=. ;; esac
# shellcheck source=scripts/prod-backup/comun.sh
source "$_aqui/comun.sh"

CARPETA="${1:-}"
[ -n "$CARPETA" ] && [ -d "$CARPETA" ] || {
  printf '%s\n' 'Uso: bash scripts/prod-backup/verificar.sh <carpeta-de-la-copia> [--conteos]' >&2
  exit 64
}
[ "${2:-}" != --conteos ] || export TINDIVO_MOSTRAR_CONTEOS=1

limpiar() {
  local rc=$?
  set +e
  CLAVE=''
  [ -z "${REG:-}" ] || rm -rf -- "$REG"
  dk rm -f "$NOMBRE_CONT" >/dev/null 2>&1
  cerrar_gpg
  exit "$rc"
}
trap limpiar EXIT
trap 'exit 130' INT TERM

paso '1. sha256 de los archivos cifrados'
comprobar_herramientas
[ -s "$CARPETA/SHA256SUMS" ] || fallo "falta $CARPETA/SHA256SUMS"
[ -s "$CARPETA/1-base.tar.gpg" ] || fallo "falta $CARPETA/1-base.tar.gpg"
[ ! -e "$CARPETA/INCOMPLETA.txt" ] || fallo 'esta copia quedó marcada como INCOMPLETA'
(cd "$CARPETA" && sha256sum -c SHA256SUMS >&2) || fallo 'algún archivo cifrado no coincide con SHA256SUMS: está dañado o no es el mismo'

paso '2. Clave de cifrado'
preparar_gpg
PERMITIR=0
grep -q '^destino: *local ' "$CARPETA/RESUMEN.txt" 2>/dev/null && PERMITIR=1
pedir_clave una "$PERMITIR"

REG="$(mktemp -d)"
comparar() { # parte, registro nuevo
  local antes="$CARPETA/$1.copia.log" ahora
  ahora="$(manifiesto_de "$2")"
  [ -n "$ahora" ] || fallo "la verificación de $1 no entregó manifiesto"
  if [ -s "$antes" ]; then
    [ "$(manifiesto_de "$antes")" = "$ahora" ] || fallo "$1: el manifiesto no es el que se anotó al sacar la copia"
    log "$1: íntegra, mismo manifiesto que al sacar la copia ($ahora)"
  else
    log "$1: íntegra (manifiesto $ahora; no hay registro original con qué compararlo)"
  fi
  if [ "$1" != 1-base ] && [ "$(estado_de "$2")" != COMPLETA ]; then
    FALTAS+=("$1 está PARCIAL (le faltan archivos)")
  fi
}
FALTAS=()

paso '3. Parte 1 · base'
verificar_base "$CARPETA/1-base.tar.gpg" "$REG/1.log"
comparar 1-base "$REG/1.log"

if [ -s "$CARPETA/2-storage.tar.gpg" ]; then
  paso 'Parte 2 · Storage'
  verificar_tar_node "$CARPETA/2-storage.tar.gpg" "$REG/2-storage.log"
  comparar 2-storage "$REG/2-storage.log"
else
  log '2-storage: no está en esta copia'
  FALTAS+=('2-storage no está en esta copia')
fi
# La configuración externa nunca entra en esta copia (va en otra entrega): se declara siempre, sin leer RESUMEN.txt
# (está en claro y fuera de SHA256SUMS: no puede decidir si una copia está completa).
FALTAS+=('sin configuración externa (Auth, Edge Functions): no entra en esta copia; va en otra entrega')
rm -rf -- "$REG"

sin_contenedores_vivos || fallo 'quedó un contenedor sin borrar: docker ps -a --filter label=tindivo-copia'
paso 'VERIFICADA, PERO ES UNA COPIA PARCIAL: lo que hay está entero y se abre con tu clave; falta esto:'
printf -- '- %s\n' "${FALTAS[@]}" >&2
if [ "${#FALTAS[@]}" -eq 1 ]; then
  paso 'PARCIAL ESPERADA: base y Storage enteros; solo falta la configuración externa (otra entrega).'
else
  paso "PARCIAL CON FALTAS: además de la configuración externa, faltan $((${#FALTAS[@]} - 1)) cosa(s)."
fi
exit 3
