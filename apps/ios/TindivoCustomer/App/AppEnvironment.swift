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

#if DEBUG
extension AppEnvironment {
    /// Para los `#Preview`: catálogo de muestra y una bolsa propia en un archivo temporal.
    static func preview() -> AppEnvironment {
        AppEnvironment(
            config: .fromBundle(),
            system: PreviewSystem(),
            catalog: PreviewCatalog(),
            cartStore: FileCartStore.preview(),
            clock: .live
        )
    }
}

private struct PreviewSystem: SystemRepository {
    func health() async throws(AppError) -> ApiHealth { ApiHealth(status: "ok", version: "v1") }
    func clientCompat() async throws(AppError) -> ClientCompat { ClientCompat(minAppVersion: "0.0.0", minOS: 17) }
}
#endif
