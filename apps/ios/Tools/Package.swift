// swift-tools-version: 6.0
// Herramientas de desarrollo de la app iOS, con versión exacta (SW-16). No entran en el binario.
// `apps/ios/scripts/gen.sh` corre el generador con `swift run` contra este paquete.

import PackageDescription

let package = Package(
    name: "TindivoTools",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.14.4")
    ],
    targets: []
)
