// swift-tools-version: 6.0
// Sistema de diseño de la app iOS (SW-2). Sin dependencias de terceros (SW-16).

import PackageDescription

let package = Package(
    name: "TindivoDesign",
    defaultLocalization: "es",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "TindivoDesign", targets: ["TindivoDesign"]),
    ],
    targets: [
        .target(
            name: "TindivoDesign",
            resources: [
                .process("Resources/Geist.ttf"),
                .copy("Resources/OFL.txt"),
                .process("Resources/Localizable.xcstrings"),
                .process("Resources/Isotipo.xcassets"),
            ]
        ),
        .testTarget(
            name: "TindivoDesignTests",
            dependencies: ["TindivoDesign"]
        ),
    ]
)
