#!/usr/bin/env bash
# build o test de la app iOS en el simulador, siempre tras regenerar (P1: nadie compila un proyecto viejo).
#   apps/ios/scripts/xcodebuild.sh build|test [Dev|Prod] [argumentos extra de xcodebuild]
# Sin firma: el simulador no la necesita (CODE_SIGNING_ALLOWED=NO).
# IOS_BUILD_NUMBER (la CI) fija CURRENT_PROJECT_VERSION, el número de build (SW-15).
set -euo pipefail

ACTION="${1:-build}"
ENV="${2:-Dev}"
shift $(( $# < 2 ? $# : 2 ))
ROOT="$(git rev-parse --show-toplevel)"
IOS="$ROOT/apps/ios"
"$IOS/scripts/gen.sh"

build_number=()
if [ -n "${IOS_BUILD_NUMBER:-}" ]; then build_number=("CURRENT_PROJECT_VERSION=$IOS_BUILD_NUMBER"); fi

# OS=latest: hay simuladores con el mismo nombre en varios runtimes.
DESTINATION="${IOS_DESTINATION:-platform=iOS Simulator,name=iPhone 17,OS=latest}"
xcodebuild "$ACTION" \
  -project "$IOS/TindivoCustomer.xcodeproj" \
  -scheme "TindivoCustomer-$ENV" \
  -destination "$DESTINATION" \
  -derivedDataPath "$IOS/build/DerivedData" \
  -onlyUsePackageVersionsFromResolvedFile \
  CODE_SIGNING_ALLOWED=NO \
  ${build_number[@]+"${build_number[@]}"} \
  "$@"
