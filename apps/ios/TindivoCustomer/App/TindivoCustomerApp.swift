import SwiftUI
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
    /// `-tindivo-now 2026-07-07T20:00:00-05:00` fija el reloj de la app: la prueba de interfaz no depende de la hora
    /// a la que corre ni de que el horario de staging esté abierto.
    private static func debugEnvironment(_ live: AppEnvironment) -> AppEnvironment {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-tindivo-now"), arguments.indices.contains(flag + 1),
              let fixed = ISO8601DateFormatter().date(from: arguments[flag + 1])
        else { return live }
        return AppEnvironment(
            config: live.config, system: live.system, catalog: live.catalog, cartStore: live.cartStore,
            clock: AppClock(now: { fixed }, sleep: { try await Task.sleep(for: $0) })
        )
    }
    #endif
}
