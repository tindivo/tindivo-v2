#!/usr/bin/env bash
# SW-14: SwiftLint (versión fijada en tools.sh) y swift-format de la toolchain, sobre los fuentes no generados.
#   apps/ios/scripts/lint.sh           comprueba: falla si SwiftLint halla errores (los avisos se muestran, no fallan)
#   apps/ios/scripts/lint.sh --format  aplica swift-format a los fuentes (reescribe archivos)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
IOS="$ROOT/apps/ios"
source "$IOS/scripts/tools.sh"
cd "$IOS"

# Solo lo versionado: lo generado (Generated/, build/, .build/) no se versiona y queda fuera.
swift_files=()
while IFS= read -r file; do swift_files+=("$file"); done < <(git ls-files -- '*.swift' | grep -v '/Generated/')

if [ "${1:-}" = "--format" ]; then
  swift format format --configuration .swift-format --in-place "${swift_files[@]}"
  echo "swift-format aplicado a ${#swift_files[@]} archivos."
  exit 0
fi

# Que falle uno no impide ver el otro: se corren ambos y se suma el resultado.
status=0
"$SWIFTLINT" lint --quiet || status=$?
swift format lint --configuration .swift-format "${swift_files[@]}" || status=$?
exit "$status"
