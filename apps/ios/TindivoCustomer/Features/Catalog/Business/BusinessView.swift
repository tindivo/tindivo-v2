import SwiftUI
import TindivoAPI
import TindivoDesign

struct BusinessView: View {
    let model: BusinessScreenModel
    let onOpenCart: () -> Void

    @State private var position: String?
    @State private var showingIndex = false
    /// El alto del selector pegado (0 sin selector) y si ya está pegado: la copia de la fila llegó bajo la barra.
    @State private var chipsHeight: CGFloat = 0
    @State private var chipsStuck = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss

    /// Lo que la hoja de la cabecera sube sobre la portada: 28 de su esquina más los 12 de separación entre filas.
    private static let headerOverlap: CGFloat = 40

    var body: some View {
        content
            .background(Color.tindivo.background)
            // La carta dibuja su propia barra (círculos sobre la portada): la de navegación se oculta, y con ella el título
            // que el sistema le daría a VoiceOver, que se deja puesto.
            .toolbar(.hidden, for: .navigationBar)
            // Sin la barra del sistema, el gesto de volver lo devuelve `InteractivePopGesture`; mientras se busca queda
            // apagado: «Volver» primero cierra la búsqueda (como `BackHandler(enabled = searching)` de Android).
            .background { InteractivePopGesture(enabled: !model.isSearching).frame(width: 0, height: 0) }
            .navigationTitle(model.visible?.name ?? String(localized: "Restaurante"))
            .tindivoToast(model.notices.message)
            .safeAreaInset(edge: .top, spacing: 0) { topInset }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                OrderingBottomBar(ordering: model.ordering, cart: model.cartBarSummary, onOpenCart: onOpenCart)
            }
            .sheet(isPresented: $showingIndex) {
                SectionIndexSheet(sections: model.visible?.sections ?? [], total: model.visible?.dishCount ?? 0) {
                    index in
                    showingIndex = false
                    jump(to: index)
                }
            }
            .sheet(isPresented: Binding(get: { model.isShowingInfo }, set: { if !$0 { model.hideInfo() } })) {
                if let info = model.info { BusinessInfoSheet(info: info, onClose: model.hideInfo) }
            }
            .fullScreenCover(item: openDish) { item in
                DishView(
                    model: model.dishModel ?? model.makeDishModel(for: item),
                    onClose: model.closeDish,
                    onAdded: model.dishAdded
                )
            }
            .task { await model.load() }
            .task { await model.runClock() }
            .task { await model.observeCart() }
    }

    // MARK: Contenido

    @ViewBuilder private var content: some View {
        switch model.state {
        case .idle, .loading:
            ProgressView()
                .accessibilityLabel(Text("Cargando"))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case let .failed(error):
            VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
                Text(ErrorText.message(for: error))
                    .tindivoText(TindivoTokens.Typography.body)
                    .foregroundStyle(Color.tindivo.ink)
                TindivoPrimaryButton("Reintentar") { Task { await model.refresh() } }
            }
            .padding(TindivoTokens.Spacing.spaceScreen)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        case let .loaded(business):
            menu(business)
        }
    }

    /// La lista queda siempre debajo: al buscar se le pone encima el resultado y, al salir, reaparece donde estaba.
    private func menu(_ business: BusinessDetail) -> some View {
        let tap: ((MenuItem) -> Void)? = model.ordering.allowsBag ? { model.open($0) } : nil
        return menuList(tap: tap)
            .accessibilityHidden(model.isSearching && model.hasSearchTerms)
            .overlay {
                if model.isSearching, model.hasSearchTerms {
                    MenuSearchResultsView(
                        hits: model.searchResults, query: model.query ?? "", businessName: business.name, onTap: tap
                    )
                    .background(Color.tindivo.background)
                }
            }
    }

    /// El alto que la barra, y el selector si hay, le quitan a la lista: la portada sube ese mismo alto para quedar
    /// detrás de ellos, desde el borde de la pantalla.
    private var coveredTop: CGFloat {
        ScreenInsets.top + BusinessTopBar.height + (model.sectionBar == nil ? 0 : chipsHeight)
    }

    private func menuList(tap: ((MenuItem) -> Void)?) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
                ForEach(model.rows, id: \.key) { row in
                    rowView(row, tap: tap)
                }
            }
            .scrollTargetLayout()
            .padding(.bottom, TindivoTokens.Spacing.spaceScreen)
        }
        .scrollPosition(id: $position, anchor: .top)
        .onChange(of: position) { _, key in model.topRowChanged(key) }
    }

    @ViewBuilder
    private func rowView(_ row: MenuRow, tap: ((MenuItem) -> Void)?) -> some View {
        switch row {
        case let .banner(url):
            banner(url: url)
        case .header:
            if let business = model.visible { header(business) }
        case let .category(category):
            CategoryHeaderView(category: category)
        case let .carousel(items):
            FeaturedCarouselView(items: items, onTap: tap)
        case let .dish(item, _):
            MenuItemRowView(item: item, onTap: tap.map { tap in { tap(item) } })
        }
    }

    private func banner(url: String?) -> some View {
        BusinessBannerView(url: url, name: model.visible?.name ?? "", statusBarHeight: ScreenInsets.top)
            .padding(.top, -coveredTop)
    }

    /// La hoja con el nombre y, debajo, el selector de secciones en su sitio de la carta. Sin foto de portada, la
    /// portada de marca va aquí encima.
    private func header(_ business: BusinessDetail) -> some View {
        VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
            if business.bannerURL == nil { banner(url: nil) }
            VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
                BusinessHeaderView(business: business, status: model.statusLine, closed: model.closedNotice)
                inFlowChips
            }
            .padding(.top, -Self.headerOverlap)
        }
    }

    // MARK: Barra superior y selector

    @ViewBuilder private var topInset: some View {
        if model.isSearching, let business = model.visible {
            BusinessSearchBar(
                businessName: business.name, query: model.query ?? "", onQueryChange: model.setQuery,
                onBack: model.closeSearch
            )
        } else {
            VStack(spacing: 0) {
                BusinessTopBar(
                    solid: model.visible == nil || model.showTitle, title: model.visible?.name,
                    status: model.statusLine, onBack: { dismiss() }, onSearch: model.startSearch
                )
                .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: model.showTitle)
                stickyChips
            }
        }
    }

    /// El selector en la carta, bajo la cabecera. Cuando sube bajo la barra lo reemplaza `stickyChips`.
    @ViewBuilder private var inFlowChips: some View {
        if let bar = model.sectionBar {
            let threshold = ScreenInsets.top + BusinessTopBar.height
            SectionChipsBar(bar: bar, onSelect: jump, onShowIndex: { showingIndex = true })
                .accessibilityHidden(chipsStuck)
                .onGeometryChange(for: Bool.self) {
                    $0.frame(in: .global).minY <= threshold + 0.5
                } action: {
                    chipsStuck = $0
                }
        }
    }

    /// La copia del selector pegada bajo la barra: siempre ocupa su sitio (así lo que hay debajo no se mueve al
    /// pegarse) y solo se ve cuando la fila real ya llegó arriba.
    @ViewBuilder private var stickyChips: some View {
        if let bar = model.sectionBar {
            SectionChipsBar(bar: bar, onSelect: jump, onShowIndex: { showingIndex = true })
                .opacity(chipsStuck ? 1 : 0)
                .allowsHitTesting(chipsStuck)
                .accessibilityHidden(!chipsStuck)
                .onGeometryChange(for: CGFloat.self) {
                    $0.size.height
                } action: {
                    chipsHeight = $0
                }
        }
    }

    private func jump(to section: Int) {
        guard let key = model.jump(toSection: section) else { return }
        if reduceMotion {
            position = key
        } else {
            withAnimation { position = key }
        }
    }

    private var openDish: Binding<MenuItem?> {
        Binding(get: { model.openDish }, set: { if $0 == nil { model.closeDish() } })
    }
}

#if DEBUG
#Preview("Negocio") {
    let environment = AppEnvironment.preview()
    NavigationStack {
        BusinessView(
            model: BusinessScreenModel(
                id: "n1", catalog: environment.catalog, cartStore: environment.cartStore, clock: environment.clock
            ),
            onOpenCart: {}
        )
    }
    .onAppear { TindivoFonts.register() }
}
#endif
