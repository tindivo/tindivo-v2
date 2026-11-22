#!/usr/bin/env bash
# Herramientas fijadas de la app iOS (SW-14, SW-16): versión exacta + sha256, sin brew ni mint.
# Se guardan en la caché del usuario, compartida entre worktrees. Imprime nada; exporta las rutas al hacer `source`.
set -euo pipefail

TINDIVO_IOS_CACHE="${TINDIVO_IOS_CACHE:-$HOME/Library/Caches/tindivo-ios}"

XCODEGEN_VERSION="2.46.0"
XCODEGEN_SHA256="4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806"
XCODEGEN_DIR="$TINDIVO_IOS_CACHE/xcodegen-$XCODEGEN_VERSION"
XCODEGEN="$XCODEGEN_DIR/xcodegen/bin/xcodegen"

# Se instala en un directorio temporal propio y se mueve de una vez: un unzip cortado o dos worktrees instalando a la
# vez nunca dejan a medias el directorio definitivo. Lo que decide si está instalado es el sello, que va al final.
if [ ! -f "$XCODEGEN_DIR/.verified" ]; then
  mkdir -p "$TINDIVO_IOS_CACHE"
  staging="$(mktemp -d "$TINDIVO_IOS_CACHE/xcodegen-tmp.XXXXXX")"
  trap 'rm -rf "$staging"' EXIT
  curl -fsSL -o "$staging/xcodegen.zip" \
    "https://github.com/yonaskolb/XcodeGen/releases/download/$XCODEGEN_VERSION/xcodegen.zip"
  actual="$(shasum -a 256 "$staging/xcodegen.zip" | cut -d' ' -f1)"
  if [ "$actual" != "$XCODEGEN_SHA256" ]; then
    echo "XcodeGen $XCODEGEN_VERSION: sha256 inesperado ($actual). No se usa." >&2
    exit 1
  fi
  unzip -q "$staging/xcodegen.zip" -d "$staging"
  touch "$staging/.verified"
  # Un directorio sin sello es una instalación vieja o cortada: se reemplaza. Si otro proceso ganó la carrera, el suyo
  # ya lleva sello (se mueve entero, verificado) y se descarta el nuestro.
  if [ -d "$XCODEGEN_DIR" ] && [ ! -f "$XCODEGEN_DIR/.verified" ]; then rm -rf "$XCODEGEN_DIR"; fi
  if [ ! -e "$XCODEGEN_DIR" ]; then mv "$staging" "$XCODEGEN_DIR" 2>/dev/null || true; fi
  rm -rf "$staging"
  trap - EXIT
  [ -f "$XCODEGEN_DIR/.verified" ] || { echo "No se pudo instalar XcodeGen en $XCODEGEN_DIR" >&2; exit 1; }
fi

# SwiftLint (SW-14): binario portable oficial de las releases de realm/SwiftLint, mismo esquema que XcodeGen.
SWIFTLINT_VERSION="0.65.1"
SWIFTLINT_SHA256="c1e429b0599cf1b516f369a2d9ec04eaf0e436f3c12b637df8851fa52ff694d0"
SWIFTLINT_DIR="$TINDIVO_IOS_CACHE/swiftlint-$SWIFTLINT_VERSION"
SWIFTLINT="$SWIFTLINT_DIR/swiftlint"

if [ ! -f "$SWIFTLINT_DIR/.verified" ]; then
  mkdir -p "$TINDIVO_IOS_CACHE"
  staging="$(mktemp -d "$TINDIVO_IOS_CACHE/swiftlint-tmp.XXXXXX")"
  trap 'rm -rf "$staging"' EXIT
  curl -fsSL -o "$staging/swiftlint.zip" \
    "https://github.com/realm/SwiftLint/releases/download/$SWIFTLINT_VERSION/portable_swiftlint.zip"
  actual="$(shasum -a 256 "$staging/swiftlint.zip" | cut -d' ' -f1)"
  if [ "$actual" != "$SWIFTLINT_SHA256" ]; then
    echo "SwiftLint $SWIFTLINT_VERSION: sha256 inesperado ($actual). No se usa." >&2
    exit 1
  fi
  unzip -q "$staging/swiftlint.zip" -d "$staging"
  rm "$staging/swiftlint.zip"
  touch "$staging/.verified"
  if [ -d "$SWIFTLINT_DIR" ] && [ ! -f "$SWIFTLINT_DIR/.verified" ]; then rm -rf "$SWIFTLINT_DIR"; fi
  if [ ! -e "$SWIFTLINT_DIR" ]; then mv "$staging" "$SWIFTLINT_DIR" 2>/dev/null || true; fi
  rm -rf "$staging"
  trap - EXIT
  [ -f "$SWIFTLINT_DIR/.verified" ] || { echo "No se pudo instalar SwiftLint en $SWIFTLINT_DIR" >&2; exit 1; }
fi

export TINDIVO_IOS_CACHE XCODEGEN SWIFTLINT
