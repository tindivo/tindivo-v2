import Foundation
import TindivoAPI

/// La única raíz de composición (SW-4): aquí se crean las dependencias y de aquí bajan por inicializador.
struct AppEnvironment: Sendable {
    let config: AppConfig
    let system: any SystemRepository
    let configService: any ConfigService
    let catalog: any CatalogRepository
    let cartStore: any CartStore
    let clock: AppClock

    @MainActor
    static func live(config: AppConfig = .fromBundle(), protocolClasses: [AnyClass]? = nil) -> AppEnvironment {
        // Todo 426 de la API (de cualquier repositorio, hoy o mañana) llega a `ConfigService` por este canal: es el
        // único camino hacia la pantalla de actualización (CLI-4).
        let (upgradeReports, reportUpgrade) = AsyncStream<String?>.makeStream()
        let api = TindivoAPIServices.live(
            baseURL: config.apiBaseURL,
            client: ClientInfo(app: "customer", appVersion: config.appVersion, build: config.build),
            onUpgradeRequired: { reportUpgrade.yield($0) },
            protocolClasses: protocolClasses
        )
        return AppEnvironment(
            config: config,
            system: api.system,
            configService: LiveConfigService(
                system: api.system, appVersion: config.appVersion, upgradeReports: upgradeReports
            ),
            catalog: api.catalog,
            cartStore: FileCartStore(),
            clock: .live
        )
    }
}

extension AppEnvironment {
    /// Las miniaturas de `AsyncImage` pasan por `URLCache.shared`, cuya capacidad por defecto es mínima: sin esto se
    /// vuelven a pedir al volver a la lista. Memoria para lo que se ve ahora y disco para la sesión siguiente.
    static func makeImageCache() -> URLCache {
        URLCache(memoryCapacity: 32 * 1024 * 1024, diskCapacity: 128 * 1024 * 1024)
    }
}

#if DEBUG
extension AppEnvironment {
    /// Para los `#Preview`: catálogo de muestra y una bolsa propia en un archivo temporal.
    @MainActor
    static func preview() -> AppEnvironment {
        AppEnvironment(
            config: .fromBundle(),
            system: PreviewSystem(),
            configService: FixedConfigService(),
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
