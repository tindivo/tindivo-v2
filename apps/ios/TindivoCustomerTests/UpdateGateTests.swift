import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

@Suite("Pantalla de actualización (CLI-4)")
struct UpdateScreenTests {
    @Test("CLI-4: sin id de la App Store no hay enlace (el botón queda deshabilitado)")
    func noStoreIdMeansNoURL() {
        #expect(AppConfig.storeURL(appStoreId: "") == nil)
        #expect(AppConfig.storeURL(appStoreId: "  ") == nil)
    }

    @Test("CLI-4: con el id de la App Store el enlace es el de la ficha")
    func storeURL() {
        #expect(AppConfig.storeURL(appStoreId: "1234567890")?.absoluteString == "https://apps.apple.com/app/id1234567890")
    }

    @Test("CLI-4: un id que no es numérico no arma enlace")
    func nonNumericIdIsRejected() {
        #expect(AppConfig.storeURL(appStoreId: "abc/../x") == nil)
    }
}

/// Un servidor que contesta 426 a todo: la API real, armada como en `AppEnvironment.live`, sin red.
final class UpgradeRequiredProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url else { return }
        let response = HTTPURLResponse(
            url: url, statusCode: 426, httpVersion: nil,
            headerFields: ["Content-Type": "application/json", "x-tindivo-min-version": "2.0.0"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"code":"client_upgrade_required"}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor
@Suite("Cableado del 426 (CLI-4)")
struct UpgradeWiringTests {
    @Test("CLI-4: un 426 del catálogo, con los repositorios armados como en AppEnvironment.live, deja el servicio en .upgradeRequired", .timeLimit(.minutes(1)))
    func catalogUpgradeReachesTheService() async throws {
        let environment = AppEnvironment.live(config: .fromBundle(.main), protocolClasses: [UpgradeRequiredProtocol.self])
        let service = try #require(environment.configService as? LiveConfigService)
        #expect(service.state == .unknown)
        await #expect(throws: AppError.upgradeRequired(minVersion: "2.0.0")) {
            try await environment.catalog.getBusiness(id: "x")
        }
        await service.waitUntil { $0.isUpgradeRequired }
        #expect(service.state == .upgradeRequired(minVersion: "2.0.0"))
    }
}
