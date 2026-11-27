import SwiftUI
import TindivoDesign

/// La raíz de la interfaz: las cuatro pestañas y, en Inicio, la pila de pantallas que se empujan encima (SW-11).
struct RootView: View {
    private let environment: AppEnvironment
    @State private var navigator = AppNavigator()
    @State private var home: CatalogHomeScreenModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var osNoticeDismissed = false

    init(environment: AppEnvironment) {
        self.environment = environment
        _home = State(
            initialValue: CatalogHomeScreenModel(
                catalog: environment.catalog, cartStore: environment.cartStore, clock: environment.clock,
                menuCache: environment.menuCache
            ))
    }

    var body: some View {
        content
            // Al abrir la app y al volver de segundo plano se relee `/config` (CLI-4).
            .task(id: scenePhase) { await environment.configService.sceneDidChange(to: scenePhase) }
    }

    /// La actualización obligatoria reemplaza a toda la app y no tiene salida: es el único camino a esa pantalla, ya
    /// sea porque `/config` lo pide o porque cualquier llamada recibió un 426.
    @ViewBuilder private var content: some View {
        let config = environment.configService
        if config.state.isUpgradeRequired {
            UpdateView(minVersion: config.state.minVersion, storeURL: environment.config.storeURL)
        } else {
            // Cada pestaña tiene su propio `NavigationStack`. `TabView` solo guarda el estado de cada una (la pila de
            // Inicio, el scroll): su barra se oculta y la dibuja `RootTabBar`.
            TabView(selection: $navigator.tab) {
                homeStack.tag(RootTab.home)
                comingSoonStack(.courier)
                comingSoonStack(.orders)
                comingSoonStack(.account)
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                if !osNoticeDismissed,
                    config.state.isBelowMinOS(ProcessInfo.processInfo.operatingSystemVersion.majorVersion)
                {
                    OSNoticeView { osNoticeDismissed = true }
                }
            }
        }
    }

    private var homeStack: some View {
        NavigationStack(path: $navigator.path) {
            CatalogHomeView(
                model: home,
                onOpenBusiness: { navigator.openBusiness($0) },
                onOpenCart: navigator.openCart,
                onOpenCourier: navigator.openCourier,
                onOpenDiagnostics: diagnosticsAction
            )
            .rootTabBar(selected: navigator.tab, onSelect: { navigator.tab = $0 })
            .toolbar(.hidden, for: .tabBar)
            .navigationDestination(for: AppRoute.self) { route in
                destination(route)
            }
        }
    }

    private func comingSoonStack(_ tab: RootTab) -> some View {
        NavigationStack {
            ComingSoonView(tab: tab)
                .rootTabBar(selected: navigator.tab, onSelect: { navigator.tab = $0 })
                .navigationTitle(Text(tab.title))
                .toolbar(.hidden, for: .navigationBar)
                .toolbar(.hidden, for: .tabBar)
        }
        .tag(tab)
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
        case .checkout:
            ComingSoonView(title: "Confirmar pedido", icon: .bag, identifier: "comingSoon.checkout")
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
    private let routeId: String

    init(id: String, environment: AppEnvironment, navigator: AppNavigator) {
        routeId = id
        _model = State(
            initialValue: BusinessScreenModel(
                id: id, catalog: environment.catalog, cartStore: environment.cartStore, clock: environment.clock,
                menuCache: environment.menuCache
            ))
        self.environment = environment
        self.navigator = navigator
    }

    var body: some View {
        BusinessView(model: model, onOpenCart: navigator.openCart)
            // La ruta puede traer el slug; al cargar la carta se sabe cuál es el id, y «+ Agregar más» los iguala.
            .onChange(of: model.state) { _, state in
                if case let .loaded(detail) = state { navigator.learn(routeId: routeId, businessId: detail.id) }
            }
    }
}

private struct CartRoute: View {
    @State private var model: CartScreenModel
    private let navigator: AppNavigator

    init(environment: AppEnvironment, navigator: AppNavigator) {
        _model = State(
            initialValue: CartScreenModel(
                store: environment.cartStore, catalog: environment.catalog, clock: environment.clock))
        self.navigator = navigator
    }

    var body: some View {
        CartView(
            model: model,
            onAddMore: navigator.addMore(to:),
            onSeeBusinesses: navigator.seeBusinesses,
            onContinue: navigator.openCheckout
        )
    }
}
