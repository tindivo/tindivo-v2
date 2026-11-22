import Foundation
import TindivoAPI
@testable import TindivoCustomer

/// La raíz de composición de las pruebas (SW-4): mismas dependencias que `live`, con dobles.
extension AppEnvironment {
    static func test(
        system: any SystemRepository = UnusedSystemRepository(),
        catalog: any CatalogRepository = UnusedCatalogRepository(),
        cartStore: any CartStore = FileCartStore(
            fileURL: FileManager.default.temporaryDirectory.appending(path: "tindivo-test-\(UUID().uuidString)/cart.json")
        ),
        clock: AppClock = .live
    ) -> AppEnvironment {
        AppEnvironment(config: .fromBundle(.main), system: system, catalog: catalog, cartStore: cartStore, clock: clock)
    }
}

/// El catálogo que una prueba no usa: si alguien lo llama, la prueba falla con un error claro y no con la red.
struct UnusedCatalogRepository: CatalogRepository {
    func listBusinesses() async throws(AppError) -> [BusinessSummary] { throw .network }
    func getBusiness(id: String) async throws(AppError) -> BusinessMenu { throw .network }
}

struct UnusedSystemRepository: SystemRepository {
    func health() async throws(AppError) -> ApiHealth { throw .network }
    func clientCompat() async throws(AppError) -> ClientCompat { throw .network }
}
