// swift-tools-version: 6.0
// Cliente de la API REST v1 (SW-2, SW-7): transporte, middlewares y traducción de errores.
// Dependencias aprobadas en SW-16: swift-openapi-runtime y swift-openapi-urlsession.

import PackageDescription

let package = Package(
    name: "TindivoAPI",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "TindivoAPI", targets: ["TindivoAPI"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.13.4"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", exact: "1.4.0"),
    ],
    targets: [
        .target(
            name: "TindivoAPI",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
            ]
        ),
        .testTarget(
            name: "TindivoAPITests",
            dependencies: ["TindivoAPI"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
