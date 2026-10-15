// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Cleanpasta",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "CleanpastaApp", targets: ["CleanpastaApp"]),
        .executable(name: "cleanpasta", targets: ["cleanpasta"]),
        .library(name: "CleanpastaCore", targets: ["CleanpastaCore"]),
    ],
    dependencies: [
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.6.0"),
    ],
    targets: [
        // Converter, clipboard and options shared by the app and the CLI.
        .target(name: "CleanpastaCore", path: "Sources/CleanpastaCore"),
        // Menu bar app.
        .executableTarget(
            name: "CleanpastaApp",
            dependencies: ["CleanpastaCore", .product(name: "Sparkle", package: "Sparkle")],
            path: "Sources/CleanpastaApp",
            linkerSettings: [
                // Sparkle.framework is embedded in Cleanpasta.app/Contents/Frameworks
                .unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"]),
            ]
        ),
        // Command line tool, shipped in Cleanpasta.app/Contents/Helpers.
        .executableTarget(name: "cleanpasta", dependencies: ["CleanpastaCore"], path: "Sources/CLI"),
    ]
)
