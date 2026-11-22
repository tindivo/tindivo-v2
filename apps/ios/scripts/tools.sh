#!/usr/bin/env bash
# Herramientas fijadas de la app iOS (SW-16): versión exacta + sha256, sin brew ni mint.
# Se guardan en la caché del usuario, compartida entre worktrees. Imprime nada; exporta las rutas al hacer `source`.
set -euo pipefail

TINDIVO_IOS_CACHE="${TINDIVO_IOS_CACHE:-$HOME/Library/Caches/tindivo-ios}"

XCODEGEN_VERSION="2.46.0"
XCODEGEN_SHA256="4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806"
XCODEGEN_DIR="$TINDIVO_IOS_CACHE/xcodegen-$XCODEGEN_VERSION"
XCODEGEN="$XCODEGEN_DIR/xcodegen/bin/xcodegen"

if [ ! -x "$XCODEGEN" ]; then
  mkdir -p "$XCODEGEN_DIR"
  zip="$XCODEGEN_DIR/xcodegen.zip"
  curl -fsSL -o "$zip" "https://github.com/yonaskolb/XcodeGen/releases/download/$XCODEGEN_VERSION/xcodegen.zip"
  actual="$(shasum -a 256 "$zip" | cut -d' ' -f1)"
  if [ "$actual" != "$XCODEGEN_SHA256" ]; then
    echo "XcodeGen $XCODEGEN_VERSION: sha256 inesperado ($actual). No se usa." >&2
    rm -rf "$XCODEGEN_DIR"
    exit 1
  fi
  unzip -q -o "$zip" -d "$XCODEGEN_DIR"
fi

export TINDIVO_IOS_CACHE XCODEGEN
