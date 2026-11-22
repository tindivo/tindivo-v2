import Foundation
import SwiftUI
import Testing
import TindivoAPI
@testable import TindivoCustomer

private struct ConfigSystem: SystemRepository {
    var compat: Script<ClientCompat>
    var gate: Gate?

    func health() async throws(AppError) -> ApiHealth { throw .network }

    func clientCompat() async throws(AppError) -> ClientCompat {
        let result = compat.next()
        await gate?.wait()
        return try result.get()
    }
}

private func compat(_ minVersion: String, features: [String: ClientFeature] = [:]) -> ClientCompat {
    ClientCompat(minAppVersion: minVersion, minOS: 17, features: features)
}

@MainActor
@Suite("Configuración remota (CLI-4)")
struct ConfigServiceTests {
    private func service(
        _ results: [Result<ClientCompat, AppError>],
        appVersion: String = "1.0.0",
        gate: Gate? = nil,
        reports: AsyncStream<String?>? = nil
    ) -> (LiveConfigService, Script<ClientCompat>) {
        let script = Script<ClientCompat>(results)
        let system = ConfigSystem(compat: script, gate: gate)
        return (LiveConfigService(system: system, appVersion: appVersion, upgradeReports: reports), script)
    }

    @Test("CLI-4: una versión menor que la mínima de iOS pide la pantalla de actualización")
    func olderVersionRequiresUpgrade() async {
        let (config, _) = service([.success(compat("1.2.0"))], appVersion: "1.1.9")
        await config.refresh()
        #expect(config.state == .upgradeRequired(minVersion: "1.2.0"))
        #expect(config.state.isUpgradeRequired)
    }

    @Test("CLI-4: la misma versión o una mayor no bloquean")
    func sameOrNewerVersionIsReady() async {
        for own in ["1.2.0", "1.10.0", "2.0"] {
            let (config, _) = service([.success(compat("1.2.0"))], appVersion: own)
            await config.refresh()
            #expect(config.state == .ready(features: [:], minOS: 17), "versión \(own)")
        }
    }

    @Test("CLI-4: una versión ilegible, en la app o en config, nunca bloquea")
    func unreadableVersionNeverBlocks() async {
        let (a, _) = service([.success(compat("pronto"))], appVersion: "1.0.0")
        await a.refresh()
        #expect(!a.state.isUpgradeRequired)
        let (b, _) = service([.success(compat("9.0.0"))], appVersion: "dev")
        await b.refresh()
        #expect(!b.state.isUpgradeRequired)
    }

    @Test("CLI-4: un 426 de /config pide actualizar, con la versión mínima de la cabecera")
    func upgradeRequiredFromConfig() async {
        let (config, _) = service([.failure(.upgradeRequired(minVersion: "3.0.0"))])
        await config.refresh()
        #expect(config.state == .upgradeRequired(minVersion: "3.0.0"))
    }

    @Test("CLI-4: un 426 de cualquier otra llamada (aviso de la API) pide actualizar")
    func upgradeRequiredFromAnyCall() async throws {
        let (stream, continuation) = AsyncStream<String?>.makeStream()
        let (config, _) = service([.success(compat("0.0.0"))], reports: stream)
        continuation.yield("2.0.0")
        for _ in 0..<200 where !config.state.isUpgradeRequired { try await Task.sleep(for: .milliseconds(10)) }
        #expect(config.state == .upgradeRequired(minVersion: "2.0.0"))
    }

    @Test("CLI-4: la actualización obligatoria no se deshace con una lectura buena posterior")
    func upgradeIsSticky() async {
        let (config, _) = service([.failure(.upgradeRequired(minVersion: "3.0.0")), .success(compat("0.0.0"))])
        await config.refresh()
        await config.refresh()
        #expect(config.state == .upgradeRequired(minVersion: "3.0.0"))
        config.reportUpgradeRequired(minVersion: nil)
        #expect(config.state == .upgradeRequired(minVersion: "3.0.0"))
    }

    @Test("CLI-4: si /config falla por red la app no se bloquea y conserva lo último que supo")
    func networkFailureDoesNotBlock() async {
        let (config, _) = service([.failure(.network), .success(compat("1.0.0")), .failure(.network)])
        await config.refresh()
        #expect(config.state == .unknown)
        await config.refresh()
        #expect(config.state == .ready(features: [:], minOS: 17))
        await config.refresh()
        #expect(config.state == .ready(features: [:], minOS: 17))
    }

    @Test("CLI-4: dos activaciones seguidas no hacen dos lecturas simultáneas")
    func overlappingRefreshesReadOnce() async {
        let gate = Gate()
        let (config, script) = service([.success(compat("0.0.0"))], gate: gate)
        let first = Task { await config.sceneDidChange(to: .active) }
        let second = Task { await config.sceneDidChange(to: .active) }
        for _ in 0..<50 { await Task.yield() }
        #expect(script.calls == 1)
        gate.open()
        await first.value
        await second.value
        #expect(script.calls == 1)
        #expect(config.state == .ready(features: [:], minOS: 17))
    }

    @Test("CLI-4: al volver la escena a .active se relee; en otro estado no")
    func sceneActiveRereads() async {
        let (config, script) = service([.success(compat("0.0.0"))])
        await config.sceneDidChange(to: .active)
        #expect(script.calls == 1)
        await config.sceneDidChange(to: .inactive)
        await config.sceneDidChange(to: .background)
        #expect(script.calls == 1)
        await config.sceneDidChange(to: .active)
        #expect(script.calls == 2)
    }

    @Test("CLI-4: los interruptores de config se exponen; una clave ausente usa el valor por defecto")
    func featuresAreExposed() async {
        let features = [
            "checkout": ClientFeature(enabled: false, message: "Pedidos en pausa"),
            "reviews": ClientFeature(enabled: true, message: nil),
        ]
        let (config, _) = service([.success(compat("0.0.0", features: features))])
        #expect(config.isEnabled("checkout", default: true), "sin lectura usa el valor por defecto")
        await config.refresh()
        #expect(!config.isEnabled("checkout", default: true))
        #expect(config.message(for: "checkout") == "Pedidos en pausa")
        #expect(config.isEnabled("reviews", default: false))
        #expect(config.isEnabled("nuevo", default: true))
        #expect(config.message(for: "nuevo") == nil)
    }
}

@Suite("Versión de la app (CLI-4)")
struct AppVersionTests {
    @Test("CLI-4: acepta 1, 1.2 y 1.2.3, y descarta el sufijo desde - o +", arguments: [
        ("1", 1, 0, 0), ("1.2", 1, 2, 0), ("1.2.3", 1, 2, 3), ("1.2.3-beta.1", 1, 2, 3), ("2.0.1+45", 2, 0, 1),
    ])
    func parses(raw: String, major: Int, minor: Int, patch: Int) throws {
        let version = try #require(AppVersion(raw))
        #expect((version.major, version.minor, version.patch) == (major, minor, patch))
    }

    @Test("CLI-4: rechaza lo que no cumple la gramática del contrato", arguments: [
        "", "a.b", "1.2.3.4", "1..2", "1234567890", "-1", "v1.2", "١.٢",
    ])
    func rejects(raw: String) {
        #expect(AppVersion(raw) == nil)
    }

    @Test("CLI-4: compara por número, no por texto")
    func comparesNumerically() throws {
        let ten = try #require(AppVersion("1.10.0"))
        let nine = try #require(AppVersion("1.9.9"))
        #expect(ten > nine)
        let short = try #require(AppVersion("1.0"))
        let long = try #require(AppVersion("1.0.0"))
        #expect(short == long)
    }
}
