import SwiftUI
import TindivoDesign

/// La raíz de la interfaz: Inicio y la pila de pantallas que se empujan encima (SW-11).
struct RootView: View {
    private let environment: AppEnvironment
    @State private var navigator = AppNavigator()
    @State private var home: CatalogHomeScreenModel

    init(environment: AppEnvironment) {
        self.environment = environment
        _home = State(initialValue: CatalogHomeScreenModel(catalog: environment.catalog))
    }

    var body: some View {
        NavigationStack(path: $navigator.path) {
            CatalogHomeView(
                model: home,
                onOpenBusiness: navigator.openBusiness,
                onOpenDiagnostics: diagnosticsAction
            )
            .navigationDestination(for: AppRoute.self) { route in
                destination(route)
            }
        }
    }

    private var diagnosticsAction: (() -> Void)? {
        #if DEBUG
        navigator.openDiagnostics
        #else
        nil
        #endif
    }

    @ViewBuilder
    private func destination(_ route: AppRoute) -> some View {
        switch route {
        case .business, .cart:
            // Las pantallas de Negocio y Bolsa llegan en los siguientes bloques de la Fase 1·B.
            EmptyView()
        #if DEBUG
        case .diagnostics:
            DiagnosticsView(model: DiagnosticsScreenModel(system: environment.system, config: environment.config))
        #endif
        }
    }
}
