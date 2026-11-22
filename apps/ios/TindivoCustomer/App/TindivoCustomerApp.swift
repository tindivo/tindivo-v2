import SwiftUI
import TindivoAPI
import TindivoDesign

@main
struct TindivoCustomerApp: App {
    private let environment: AppEnvironment

    init() {
        TindivoFonts.register()
        #if DEBUG
        // Las pruebas de interfaz parten de una bolsa vacía: la de una corrida anterior abriría otra pregunta.
        if ProcessInfo.processInfo.arguments.contains("-tindivo-reset-cart") {
            try? FileManager.default.removeItem(at: FileCartStore.defaultFileURL)
        }
        #endif
        #if DEBUG
        environment = Self.debugEnvironment(.live())
        #else
        environment = .live()
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootView(environment: environment)
        }
    }

    #if DEBUG
    /// Ganchos de las pruebas de interfaz, solo en DEBUG:
    /// - `-tindivo-now 2026-07-07T20:00:00-05:00` fija el reloj de la app: no depende de la hora a la que corre.
    /// - `-tindivo-fake-catalog` usa la carta de las vistas previas en vez de la API: el flujo no depende de staging.
    private static func debugEnvironment(_ live: AppEnvironment) -> AppEnvironment {
        let arguments = ProcessInfo.processInfo.arguments
        let catalog: any CatalogRepository = arguments.contains("-tindivo-fake-catalog") ? PreviewCatalog() : live.catalog
        var clock = live.clock
        if let flag = arguments.firstIndex(of: "-tindivo-now"), arguments.indices.contains(flag + 1),
           let fixed = ISO8601DateFormatter().date(from: arguments[flag + 1]) {
            clock = AppClock(now: { fixed }, sleep: { try await Task.sleep(for: $0) })
        }
        return AppEnvironment(
            config: live.config, system: live.system, catalog: catalog, cartStore: live.cartStore, clock: clock
        )
    }
    #endif
}
