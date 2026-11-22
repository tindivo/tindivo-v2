import Foundation
import TindivoAPI

/// La única raíz de composición (SW-4): aquí se crean las dependencias y de aquí bajan por inicializador.
struct AppEnvironment: Sendable {
    let config: AppConfig
    let system: any SystemRepository
    let catalog: any CatalogRepository
    let cartStore: any CartStore
    let clock: AppClock

    static func live(config: AppConfig = .fromBundle()) -> AppEnvironment {
        let client = TindivoAPIClient.make(
            baseURL: config.apiBaseURL,
            client: ClientInfo(app: "customer", appVersion: config.appVersion, build: config.build)
        )
        return AppEnvironment(
            config: config,
            system: LiveSystemRepository(client: client),
            catalog: LiveCatalogRepository(client: client),
            cartStore: FileCartStore(),
            clock: .live
        )
    }
}
