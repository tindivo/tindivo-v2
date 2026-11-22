#!/usr/bin/env bash
# build o test de la app iOS en el simulador, siempre tras regenerar (P1: nadie compila un proyecto viejo).
#   apps/ios/scripts/xcodebuild.sh build|test [Dev|Prod]
# Sin firma: el simulador no la necesita (CODE_SIGNING_ALLOWED=NO).
set -euo pipefail

ACTION="${1:-build}"
ENV="${2:-Dev}"
ROOT="$(git rev-parse --show-toplevel)"
IOS="$ROOT/apps/ios"
"$IOS/scripts/gen.sh"

# OS=latest: hay simuladores con el mismo nombre en varios runtimes.
DESTINATION="${IOS_DESTINATION:-platform=iOS Simulator,name=iPhone 17,OS=latest}"
xcodebuild "$ACTION" \
  -project "$IOS/TindivoCustomer.xcodeproj" \
  -scheme "TindivoCustomer-$ENV" \
  -destination "$DESTINATION" \
  -derivedDataPath "$IOS/build/DerivedData" \
  CODE_SIGNING_ALLOWED=NO
