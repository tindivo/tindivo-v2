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
umask 077
export LC_ALL=C

# shellcheck source=scripts/prod-backup/comun.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/comun.sh"

CARPETA="${1:-}"
[ -n "$CARPETA" ] && [ -d "$CARPETA" ] || {
  sed -n '2,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 64
}
[ "${2:-}" != --conteos ] || export TINDIVO_MOSTRAR_CONTEOS=1

limpiar() {
  local rc=$?
  set +e
  CLAVE=''
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
    log "$1: OK, mismo manifiesto que al sacar la copia ($ahora)"
  else
    log "$1: OK (manifiesto $ahora; no hay registro original con qué compararlo)"
  fi
}

paso '3. Parte 1 · base'
verificar_base "$CARPETA/1-base.tar.gpg" "$REG/1.log"
comparar 1-base "$REG/1.log"

for parte in 2-storage 3-config; do
  if [ -s "$CARPETA/$parte.tar.gpg" ]; then
    paso "Parte $parte"
    verificar_tar_node "$CARPETA/$parte.tar.gpg" "$REG/$parte.log"
    comparar "$parte" "$REG/$parte.log"
  else
    log "$parte: no está en esta copia"
  fi
done
rm -rf -- "$REG"

sin_contenedores_vivos || fallo 'quedó un contenedor sin borrar: docker ps -a --filter label=tindivo-copia'
paso 'VERIFICADA: los archivos están enteros, se abren con tu clave y el dump se lee completo.'
