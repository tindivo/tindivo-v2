import Foundation
import SwiftUI
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// La raíz de composición de las pruebas (SW-4): mismas dependencias que `live`, con dobles.
extension AppEnvironment {
    @MainActor
    static func test(
        system: any SystemRepository = UnusedSystemRepository(),
        configService: (any ConfigService)? = nil,
        catalog: any CatalogRepository = UnusedCatalogRepository(),
        cartStore: any CartStore = FileCartStore(
            fileURL: FileManager.default.temporaryDirectory.appending(
                path: "tindivo-test-\(UUID().uuidString)/cart.json")
        ),
        clock: AppClock = .live
    ) -> AppEnvironment {
        AppEnvironment(
            config: .fromBundle(.main),
            system: system,
            configService: configService ?? StubConfigService(),
            catalog: catalog,
            cartStore: cartStore,
            clock: clock
        )
    }
}

/// El catálogo que una prueba no usa: si alguien lo llama, la prueba falla con un error claro y no con la red.
struct UnusedCatalogRepository: CatalogRepository {
    func listBusinesses() async throws(AppError) -> [BusinessSummary] {
        Issue.record("listBusinesses: esta prueba no debía llamar al catálogo")
        throw unused("listBusinesses")
    }

    func getBusiness(id: String) async throws(AppError) -> BusinessMenu {
        Issue.record("getBusiness(\(id)): esta prueba no debía llamar al catálogo")
        throw unused("getBusiness")
    }

    private func unused(_ operation: String) -> AppError {
        .unknown(code: nil, detail: "UnusedCatalogRepository.\(operation) llamado sin doble", status: nil)
    }
}

struct UnusedSystemRepository: SystemRepository {
    func health() async throws(AppError) -> ApiHealth { throw .network }
    func clientCompat() async throws(AppError) -> ClientCompat { throw .network }
}

/// La configuración remota que una prueba no necesita: nunca pide actualizar y no lee nada.
@MainActor
final class StubConfigService: ConfigService {
    var state: ConfigState = .unknown
    func refresh() async {}
    func reportUpgradeRequired(minVersion: String?) {}
    func sceneDidChange(to phase: ScenePhase) async {}
}
