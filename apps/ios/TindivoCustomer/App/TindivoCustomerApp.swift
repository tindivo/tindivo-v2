import SwiftUI
import TindivoAPI
import TindivoDesign

@main
struct TindivoCustomerApp: App {
    private let environment: AppEnvironment

    init() {
        TindivoFonts.register()
        URLCache.shared = AppEnvironment.makeImageCache()
        #if DEBUG
        // Las pruebas de interfaz parten de una bolsa vacía: la de una corrida anterior abriría otra pregunta.
        if ProcessInfo.processInfo.arguments.contains("-tindivo-reset-cart") {
            try? FileManager.default.removeItem(at: FileCartStore.defaultFileURL)
        }
        // `-tindivo-seed-other-bag` deja una bolsa de OTRO negocio (n2 de las vistas previas) antes de arrancar:
        // así la prueba de interfaz recorre la pregunta «¿Empezar una bolsa nueva?».
        if ProcessInfo.processInfo.arguments.contains("-tindivo-seed-other-bag") {
            Self.seedOtherBag()
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
    /// Escribe en el archivo de la bolsa una bolsa de Chifa Lung Fung (`n2`), con un plato.
    private static func seedOtherBag() {
        let other = PreviewData.summaries[1]
        let line = CartLine(
            itemId: "seed-1", name: "Arroz chaufa", basePrice: PreviewData.price, modifiers: [], note: nil,
            quantity: 1, imageURL: nil
        )
        guard let snapshot = Cart(businessId: other.id, businessName: other.name, lines: [line]).snapshot(),
              let data = try? CartSnapshotCodec.encode(snapshot) else { return }
        let url = FileCartStore.defaultFileURL
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: .atomic)
    }

    /// Ganchos de las pruebas de interfaz, solo en DEBUG:
    /// - `-tindivo-now 2026-07-07T20:00:00-05:00` fija el reloj de la app: no depende de la hora a la que corre.
    /// - `-tindivo-now-file <ruta>` deja que la prueba mueva el reloj reescribiendo ese archivo.
    /// - `-tindivo-seed-other-bag` empieza con una bolsa de otro negocio (`n2`).
    /// - `-tindivo-fake-catalog` usa la carta de las vistas previas en vez de la API: el flujo no depende de staging,
    ///   y tampoco `/config` (una configuración fija que nunca pide actualizar).
    /// - `-tindivo-force-upgrade` deja la app en «actualización obligatoria», sin red.
    private static func debugEnvironment(_ live: AppEnvironment) -> AppEnvironment {
        let arguments = ProcessInfo.processInfo.arguments
        let fakeCatalog = arguments.contains("-tindivo-fake-catalog")
        let catalog: any CatalogRepository = fakeCatalog ? PreviewCatalog() : live.catalog
        let configService: any ConfigService = if arguments.contains("-tindivo-force-upgrade") {
            FixedConfigService(.upgradeRequired(minVersion: "9.9.9"))
        } else if fakeCatalog {
            FixedConfigService()
        } else {
            live.configService
        }
        var clock = live.clock
        if let flag = arguments.firstIndex(of: "-tindivo-now"), arguments.indices.contains(flag + 1),
           let fixed = ISO8601DateFormatter().date(from: arguments[flag + 1]) {
            clock = AppClock(now: { fixed }, sleep: { try await Task.sleep(for: $0) })
        }
        // `-tindivo-now-file <ruta>`: el reloj lo maneja la prueba. Cada vez que la app pregunta la hora lee el archivo (una
        // fecha ISO 8601) y la espera de la carta dura 200 ms: la prueba reescribe el archivo y la pantalla reacciona,
        // sin esperar tiempo real.
        if let flag = arguments.firstIndex(of: "-tindivo-now-file"), arguments.indices.contains(flag + 1) {
            let path = arguments[flag + 1]
            let fallback = clock.now()
            clock = AppClock(
                now: {
                    guard let text = try? String(contentsOfFile: path, encoding: .utf8),
                          let date = ISO8601DateFormatter().date(from: text.trimmingCharacters(in: .whitespacesAndNewlines))
                    else { return fallback }
                    return date
                },
                sleep: { _ in try await Task.sleep(for: .milliseconds(200)) }
            )
        }
        // `-tindivo-clock-fast`: el reloj arranca en `-tindivo-now` y avanza un minuto por segundo real, y la espera
        // de la carta dura un segundo: así se ve en segundos lo que pasa al salir de la franja de un plato.
        if arguments.contains("-tindivo-clock-fast") {
            let start = clock.now()
            let origin = ContinuousClock.now
            clock = AppClock(
                now: { start.addingTimeInterval(Double((ContinuousClock.now - origin).components.seconds) * 60) },
                sleep: { _ in try await Task.sleep(for: .seconds(1)) }
            )
        }
        return AppEnvironment(
            config: live.config, system: live.system, configService: configService, catalog: catalog,
            cartStore: live.cartStore, clock: clock
        )
    }
    #endif
}
