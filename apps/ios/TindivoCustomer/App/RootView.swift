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
        case let .business(id):
            BusinessRoute(id: id, environment: environment, navigator: navigator)
        case .cart:
            CartRoute(environment: environment, navigator: navigator)
        #if DEBUG
        case .diagnostics:
            DiagnosticsView(model: DiagnosticsScreenModel(system: environment.system, config: environment.config))
        #endif
        }
    }
}

/// Crea el modelo de Negocio una sola vez por pantalla empujada: la ruta puede reevaluarse sin perder la carta.
private struct BusinessRoute: View {
    @State private var model: BusinessScreenModel
    private let environment: AppEnvironment
    private let navigator: AppNavigator

    init(id: String, environment: AppEnvironment, navigator: AppNavigator) {
        _model = State(initialValue: BusinessScreenModel(
            id: id, catalog: environment.catalog, cartStore: environment.cartStore, clock: environment.clock
        ))
        self.environment = environment
        self.navigator = navigator
    }

    var body: some View {
        BusinessView(model: model, environment: environment, onOpenCart: navigator.openCart)
    }
}

private struct CartRoute: View {
    @State private var model: CartScreenModel
    private let navigator: AppNavigator

    init(environment: AppEnvironment, navigator: AppNavigator) {
        _model = State(initialValue: CartScreenModel(store: environment.cartStore))
        self.navigator = navigator
    }

    var body: some View {
        CartView(
            model: model,
            onAddMore: navigator.addMore(to:),
            onSeeBusinesses: navigator.seeBusinesses,
            onContinue: {
                // Fase 2: checkout
            }
        )
    }
}
