import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TindivoAPI

private func repository(_ transport: StubTransport) -> LiveSystemRepository {
    let client = TindivoAPIClient.make(
        baseURL: URL(string: "https://api.test/api/v1")!,
        client: ClientInfo(app: "customer", appVersion: "0.1.0", build: "1"),
        transport: transport
    )
    return LiveSystemRepository(client: client)
}

@Suite("Repositorio de sistema contra el cliente generado")
struct SystemRepositoryTests {
    @Test("lee /health")
    func health() async throws {
        let json = #"{"data":{"status":"ok","service":"tindivo-api","version":"v1","time":"2026-11-22T07:00:00Z"}}"#
        let health = try await repository(.json(200, json)).health()
        #expect(health == ApiHealth(status: "ok", version: "v1"))
    }

    @Test("CLI-2: un campo nuevo y un valor nuevo de enum no rompen la decodificación")
    func forwardCompatible() async throws {
        let json = #"""
            {"data":{"status":"degraded","service":"tindivo-api","version":"v1","time":"2026-11-22T07:00:00Z",
            "campoNuevo":{"x":1}},"meta":"nuevo"}
            """#
        let health = try await repository(.json(200, json)).health()
        #expect(health.status == "degraded")
    }

    @Test("lee la versión mínima de customer en iOS desde /config (con la forma real que dio staging el 2026-11-22)")
    func clientCompat() async throws {
        let json = #"""
            {"data":{"minAppVersion":{"customer":{"ios":"1.2.0","android":"1.0.0"},
            "negocios":{"ios":"0.0.0","android":"0.0.0"},"motorizados":{"ios":"0.0.0","android":"0.0.0"}},
            "minOs":{"android":26,"ios":17},"features":{},"apiVersion":"v1","serverTime":"2026-11-22T07:30:47.542Z"}}
            """#
        let compat = try await repository(.json(200, json)).clientCompat()
        #expect(compat == ClientCompat(minAppVersion: "1.2.0", minOS: 17))
    }

    @Test("CLI-4: los interruptores de /config llegan con su estado y su mensaje")
    func clientFeatures() async throws {
        let json = #"""
            {"data":{"minAppVersion":{"customer":{"ios":"1.0.0","android":"1.0.0"},
            "negocios":{"ios":"0.0.0","android":"0.0.0"},"motorizados":{"ios":"0.0.0","android":"0.0.0"}},
            "minOs":{"android":26,"ios":17},
            "features":{"checkout":{"enabled":false,"message":"Pedidos en pausa"},"reviews":{"enabled":true}},
            "apiVersion":"v1","serverTime":"2026-11-22T07:30:47.542Z"}}
            """#
        let compat = try await repository(.json(200, json)).clientCompat()
        #expect(
            compat.features == [
                "checkout": ClientFeature(enabled: false, message: "Pedidos en pausa"),
                "reviews": ClientFeature(enabled: true, message: nil),
            ])
    }

    @Test("CLI-4: un 426 de cualquier operación avisa una vez con la versión mínima (salud y catálogo)")
    func upgradeRequiredIsReportedFromAnyOperation() async {
        var headers = HTTPFields()
        headers[ClientHeaders.minVersion] = "2.0.0"
        let transport = StubTransport.json(426, #"{"code":"client_upgrade_required"}"#, headers: headers)
        let seen = Reports()
        let client = TindivoAPIClient.make(
            baseURL: URL(string: "https://api.test/api/v1")!,
            client: ClientInfo(app: "customer", appVersion: "0.1.0", build: "1"),
            transport: transport,
            onUpgradeRequired: { seen.add($0) }
        )
        _ = try? await LiveSystemRepository(client: client).health()
        _ = try? await LiveCatalogRepository(client: client).listBusinesses()
        #expect(seen.values == ["2.0.0", "2.0.0"])
    }

    @Test("CLI-4: un 426 cuyo cuerpo se cancela al leerlo avisa igual (el aviso sale antes de leer el cuerpo)")
    func upgradeIsReportedEvenIfTheBodyIsCancelled() async {
        let headers: HTTPFields = [ClientHeaders.minVersion: "2.0.0"]
        let transport = StubTransport { _ in
            let body = AsyncThrowingStream<ArraySlice<UInt8>, any Error> { $0.finish(throwing: CancellationError()) }
            return (HTTPResponse(status: .init(code: 426), headerFields: headers), HTTPBody(body, length: .unknown))
        }
        let seen = Reports()
        let client = TindivoAPIClient.make(
            baseURL: URL(string: "https://api.test/api/v1")!,
            client: ClientInfo(app: "customer", appVersion: "0.1.0", build: "1"),
            transport: transport,
            onUpgradeRequired: { seen.add($0) }
        )
        await #expect(throws: AppError.cancelled) { try await LiveSystemRepository(client: client).health() }
        #expect(seen.values == ["2.0.0"])
    }

    @Test("M6: la sesión de /config ignora la caché local y no usa URLCache; la normal sí la usa")
    func configSessionBypassesTheLocalCache() {
        let uncached = TindivoHTTP.makeSession(ignoreLocalCache: true).configuration
        #expect(uncached.requestCachePolicy == .reloadIgnoringLocalCacheData)
        #expect(uncached.urlCache == nil)
        let normal = TindivoHTTP.makeSession().configuration
        #expect(normal.requestCachePolicy == .useProtocolCachePolicy)
        #expect(normal.urlCache != nil)
    }

    @Test("CLI-4: un error que no es 426 no avisa de actualización")
    func otherErrorsDoNotReportUpgrade() async {
        let seen = Reports()
        let client = TindivoAPIClient.make(
            baseURL: URL(string: "https://api.test/api/v1")!,
            client: ClientInfo(app: "customer", appVersion: "0.1.0", build: "1"),
            transport: StubTransport.json(409, #"{"code":"conflict"}"#),
            onUpgradeRequired: { seen.add($0) }
        )
        _ = try? await LiveSystemRepository(client: client).health()
        #expect(seen.values.isEmpty)
    }

    @Test("un 426 llega como actualización obligatoria, aunque la operación no lo documente")
    func upgradeRequired() async {
        var headers = HTTPFields()
        headers[ClientHeaders.minVersion] = "2.0.0"
        let transport = StubTransport.json(426, #"{"code":"client_upgrade_required"}"#, headers: headers)
        await #expect(throws: AppError.upgradeRequired(minVersion: "2.0.0")) {
            try await repository(transport).health()
        }
    }

    @Test("sin red es .network")
    func network() async {
        let transport = StubTransport { _ in throw URLError(.notConnectedToInternet) }
        await #expect(throws: AppError.network) {
            try await repository(transport).health()
        }
    }

    @Test("las cabeceras de cliente llegan al transporte")
    func headersReachTransport() async throws {
        let seen = Seen()
        let transport = StubTransport { request in
            await seen.set(request.headerFields[ClientHeaders.platform])
            let body = #"{"data":{"status":"ok","service":"tindivo-api","version":"v1","time":"t"}}"#
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(body))
        }
        _ = try await repository(transport).health()
        #expect(await seen.value == "ios")
    }
}

private actor Seen {
    var value: String?
    func set(_ value: String?) { self.value = value }
}

private final class Reports: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [String?] = []
    func add(_ value: String?) { lock.withLock { stored.append(value) } }
    var values: [String?] { lock.withLock { stored } }
}
