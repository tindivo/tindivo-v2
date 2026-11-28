#!/usr/bin/env bash
# Herramientas fijadas de la app iOS (SW-14, SW-16): versión exacta + sha256, sin brew ni mint.
# Se guardan en la caché del usuario, compartida entre worktrees. Imprime nada; exporta las rutas al hacer `source`.
#
# La caché no es de fiar por sí sola (la comparten los worktrees y la CI la restaura con actions/cache): en CADA uso se
# vuelve a comprobar el zip contra el sha256 fijado aquí y el binario contra el que trae ese zip (auditoría de #260,
# CAX-C02). Un zip o un binario alterados fallan con «sha256 inesperado»; una caché del formato anterior (sin el zip)
# se reinstala.
set -euo pipefail

TINDIVO_IOS_CACHE="${TINDIVO_IOS_CACHE:-$HOME/Library/Caches/tindivo-ios}"

# ¿La instalación en <dir> está completa y es la fijada? 0 sí; 1 no instalada (o formato anterior); 2 alterada.
tindivo_tool_check() {
  local dir="$1" zip="$2" sha="$3" member="$4" bin="$5"
  [ -f "$dir/.verified" ] && [ -f "$zip" ] && [ -f "$bin" ] || return 1
  [ "$(shasum -a 256 "$zip" | cut -d' ' -f1)" = "$sha" ] || return 2
  [ "$(unzip -p "$zip" "$member" | shasum -a 256 | cut -d' ' -f1)" = "$(shasum -a 256 "$bin" | cut -d' ' -f1)" ] || return 2
  return 0
}

# Descarga, comprueba e instala <nombre> en <dir>, conservando el zip para las comprobaciones siguientes. Se instala en
# un directorio temporal propio y se mueve de una vez: un unzip cortado o dos worktrees instalando a la vez nunca dejan
# a medias el directorio definitivo. Lo que decide si está instalado es el sello, que va al final.
tindivo_tool_install() {
  local name="$1" version="$2" url="$3" sha="$4" dir="$5" zipname="$6"
  mkdir -p "$TINDIVO_IOS_CACHE"
  local staging
  staging="$(mktemp -d "$TINDIVO_IOS_CACHE/$name-tmp.XXXXXX")"
  # Se carga con `source`: se guarda y se repone el trap EXIT de quien llama.
  local prev_exit_trap
  prev_exit_trap="$(trap -p EXIT)"
  # shellcheck disable=SC2064  # `staging` se fija ahora, a propósito.
  trap "rm -rf '$staging'" EXIT
  curl -fsSL -o "$staging/$zipname" "$url"
  local actual
  actual="$(shasum -a 256 "$staging/$zipname" | cut -d' ' -f1)"
  if [ "$actual" != "$sha" ]; then
    echo "$name $version: sha256 inesperado ($actual). No se usa." >&2
    exit 1
  fi
  unzip -q "$staging/$zipname" -d "$staging"
  touch "$staging/.verified"
  # Un directorio sin sello, o sin el zip (formato anterior), se reemplaza. Si otro proceso ganó la carrera, el suyo ya
  # lleva sello (se mueve entero, verificado) y se descarta el nuestro.
  if [ -d "$dir" ] && { [ ! -f "$dir/.verified" ] || [ ! -f "$dir/$zipname" ]; }; then rm -rf "$dir"; fi
  if [ ! -e "$dir" ]; then mv "$staging" "$dir" 2>/dev/null || true; fi
  rm -rf "$staging"
  if [ -n "$prev_exit_trap" ]; then eval "$prev_exit_trap"; else trap - EXIT; fi
  [ -f "$dir/.verified" ] || { echo "No se pudo instalar $name en $dir" >&2; exit 1; }
}

# Comprueba la herramienta y, si no está instalada (o es del formato anterior), la instala y vuelve a comprobar.
tindivo_tool() {
  local name="$1" version="$2" url="$3" sha="$4" dir="$5" zipname="$6" member="$7" bin="$8" status=0
  tindivo_tool_check "$dir" "$dir/$zipname" "$sha" "$member" "$bin" || status=$?
  if [ "$status" -eq 1 ]; then
    tindivo_tool_install "$name" "$version" "$url" "$sha" "$dir" "$zipname"
    status=0
    tindivo_tool_check "$dir" "$dir/$zipname" "$sha" "$member" "$bin" || status=$?
  fi
  if [ "$status" -ne 0 ]; then
    echo "$name $version: sha256 inesperado en la caché ($dir). Bórrala y vuelve a correr." >&2
    exit 1
  fi
}

XCODEGEN_VERSION="2.46.0"
XCODEGEN_SHA256="4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806"
XCODEGEN_DIR="$TINDIVO_IOS_CACHE/xcodegen-$XCODEGEN_VERSION"
XCODEGEN="$XCODEGEN_DIR/xcodegen/bin/xcodegen"
tindivo_tool XcodeGen "$XCODEGEN_VERSION" \
  "https://github.com/yonaskolb/XcodeGen/releases/download/$XCODEGEN_VERSION/xcodegen.zip" \
  "$XCODEGEN_SHA256" "$XCODEGEN_DIR" xcodegen.zip xcodegen/bin/xcodegen "$XCODEGEN"

# SwiftLint (SW-14): binario portable oficial de las releases de realm/SwiftLint, mismo esquema que XcodeGen.
SWIFTLINT_VERSION="0.65.1"
SWIFTLINT_SHA256="c1e429b0599cf1b516f369a2d9ec04eaf0e436f3c12b637df8851fa52ff694d0"
SWIFTLINT_DIR="$TINDIVO_IOS_CACHE/swiftlint-$SWIFTLINT_VERSION"
SWIFTLINT="$SWIFTLINT_DIR/swiftlint"
tindivo_tool SwiftLint "$SWIFTLINT_VERSION" \
  "https://github.com/realm/SwiftLint/releases/download/$SWIFTLINT_VERSION/portable_swiftlint.zip" \
  "$SWIFTLINT_SHA256" "$SWIFTLINT_DIR" portable_swiftlint.zip swiftlint "$SWIFTLINT"

export TINDIVO_IOS_CACHE XCODEGEN SWIFTLINT
