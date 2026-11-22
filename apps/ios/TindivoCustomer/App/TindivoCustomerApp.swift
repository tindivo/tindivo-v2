import SwiftUI
import TindivoDesign

@main
struct TindivoCustomerApp: App {
    private let environment: AppEnvironment

    init() {
        TindivoFonts.register()
        environment = .live()
    }

    var body: some Scene {
        WindowGroup {
            // Fase 0: la app abre en Diagnóstico. En la Fase 1 la raíz pasa a ser el catálogo y Diagnóstico queda
            // solo en Dev, como en Android.
            DiagnosticsView(model: DiagnosticsScreenModel(system: environment.system, config: environment.config))
        }
    }
}
