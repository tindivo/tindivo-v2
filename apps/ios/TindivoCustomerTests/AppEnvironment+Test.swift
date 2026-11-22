import Foundation
import TindivoAPI
@testable import TindivoCustomer

/// La raíz de composición de las pruebas (SW-4): mismas dependencias que `live`, con dobles.
extension AppEnvironment {
    static func test(
        system: any SystemRepository,
        catalog: any CatalogRepository = UnusedCatalogRepository()
    ) -> AppEnvironment {
        AppEnvironment(config: .fromBundle(.main), system: system, catalog: catalog)
    }
}

/// El catálogo que una prueba no usa: si alguien lo llama, la prueba falla con un error claro y no con la red.
struct UnusedCatalogRepository: CatalogRepository {
    func listBusinesses() async throws(AppError) -> [BusinessSummary] { throw .network }
    func getBusiness(id: String) async throws(AppError) -> BusinessMenu { throw .network }
}
