#!/usr/bin/env bash
# Prepara todo lo generado de la app iOS y el .xcodeproj (no versionados). Lo llaman ios:build e ios:test.
#   1. el contrato copiado está al día (CLI-1)
#   2. documento tolerante (CLI-2) y cliente Swift con el generador fijado (SW-7)
#   3. tokens de diseño desde packages/design-tokens
#   4. colorsets del catálogo de assets (AccentColor, LaunchBackground) desde los mismos tokens
#   5. xcodegen
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
IOS="$ROOT/apps/ios"
source "$IOS/scripts/tools.sh"

"$ROOT/scripts/sync-openapi.sh" --check >/dev/null || {
  echo "La copia del contrato en iOS está desactualizada: corre scripts/sync-openapi.sh" >&2
  exit 1
}

API="$IOS/Packages/TindivoAPI"
# Dentro del worktree (build/ está ignorado): dos worktrees en paralelo no se pisan el documento.
WORK="$IOS/build/openapi"
mkdir -p "$WORK"
node "$ROOT/scripts/ios-openapi-tolerant.mjs" "$API/openapi/v1.json" "$WORK/openapi.json"
# Solo las versiones de Tools/Package.resolved: si el manifiesto y el resolved dejan de coincidir, falla en vez de
# resolver por red sin avisar (auditoría de #260, CAX-C03; la app ya compila con -onlyUsePackageVersionsFromResolvedFile).
swift run --force-resolved-versions --package-path "$IOS/Tools" --scratch-path "$TINDIVO_IOS_CACHE/tools" \
  swift-openapi-generator generate "$WORK/openapi.json" \
  --config "$API/openapi-generator-config.yaml" \
  --output-directory "$API/Sources/TindivoAPI/Generated"

mkdir -p "$IOS/Packages/TindivoDesign/Sources/TindivoDesign/Generated"
cp "$ROOT/packages/design-tokens/generated/swift/TindivoTokens.swift" \
  "$IOS/Packages/TindivoDesign/Sources/TindivoDesign/Generated/TindivoTokens.swift"

node "$ROOT/scripts/ios-colorsets.mjs" "$ROOT/packages/design-tokens/tokens.json" \
  "$IOS/TindivoCustomer/Resources/Assets.xcassets"

"$XCODEGEN" generate --quiet --spec "$IOS/project.yml"
echo "iOS listo: $IOS/TindivoCustomer.xcodeproj"
