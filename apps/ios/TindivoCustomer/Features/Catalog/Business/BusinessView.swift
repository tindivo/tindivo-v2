import SwiftUI
import TindivoAPI
import TindivoDesign

struct BusinessView: View {
    let model: BusinessScreenModel
    let onOpenCart: () -> Void

    @State private var position: String?
    @State private var showingIndex = false
    @FocusState private var searchFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        content
            .background(Color.tindivo.background)
            .navigationBarTitleDisplayMode(.inline)
            // El título siempre está (VoiceOver y el botón «volver» de la pantalla siguiente lo leen); lo que se ve en la
            // barra es la vista de `.principal`, que solo aparece al pasar la portada.
            .navigationTitle(model.visible?.name ?? String(localized: "Restaurante"))
            .navigationBarBackButtonHidden(model.isSearching)
            .toolbar { toolbar }
            .tindivoToast(model.notices.message)
            .safeAreaInset(edge: .top, spacing: 0) { chips }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                OrderingBottomBar(ordering: model.ordering, cart: model.cartBarSummary, onOpenCart: onOpenCart)
            }
            .sheet(isPresented: $showingIndex) {
                SectionIndexSheet(sections: model.visible?.sections ?? [], total: model.visible?.dishCount ?? 0) { index in
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
                    onAdded: model.dishAdded,
                    onLineGone: model.closeDish
                )
            }
            // «+» con la bolsa de otro restaurante: la misma pregunta que hace la ficha.
            .alert(
                Text("¿Empezar una bolsa nueva?"),
                isPresented: Binding(get: { model.replacement != nil }, set: { _ in }),
                presenting: model.replacement
            ) { _ in
                Button("Mantener", role: .cancel) { model.keepCurrentBag() }
                Button("Vaciar y empezar") { Task { await model.confirmReplacement() } }
            } message: { names in
                Text("Tu bolsa tiene productos de \(names.current). Solo puedes pedir de un restaurante a la vez. Si continúas, vaciaremos tu bolsa para empezar en \(names.new).")
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
                        hits: model.searchResults, query: model.query ?? "", businessName: business.name, onTap: tap,
                        action: rowAction
                    )
                    .background(Color.tindivo.background)
                }
            }
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
            TindivoAsyncImage(url: url)
                .frame(maxWidth: .infinity)
                .frame(height: 160)
        case .header:
            if let business = model.visible {
                BusinessHeaderView(
                    business: business, status: model.statusLine, modes: model.info?.modes ?? [], onShowInfo: model.showInfo
                )
            }
        case let .category(category):
            CategoryHeaderView(category: category)
        case let .carousel(items):
            FeaturedCarouselView(items: items, onTap: tap, action: rowAction)
        case let .dish(item, _):
            MenuItemRowView(item: item, action: rowAction(item), onTap: tap.map { tap in { tap(item) } })
        }
    }

    /// El contador de la tarjeta de un plato y qué hace cada toque (CUS-CAT-029).
    private func rowAction(_ item: MenuItem) -> DishRowAction? {
        model.control(for: item).map { control in
            DishRowAction(
                control: control,
                onAdd: { Task { await model.increment(item) } },
                onDecrease: { Task { await model.decrement(item) } },
                onChoose: { if model.chooseOptions(item) == .bag { onOpenCart() } }
            )
        }
    }

    // MARK: Barra superior

    @ViewBuilder private var chips: some View {
        if let bar = model.sectionBar {
            SectionChipsBar(bar: bar, onSelect: jump, onShowIndex: { showingIndex = true })
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

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if model.isSearching {
            ToolbarItem(placement: .topBarLeading) {
                TindivoIconButton(.back, label: "Volver") { model.closeSearch() }
            }
            ToolbarItem(placement: .principal) { searchField }
            if !(model.query ?? "").isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    TindivoIconButton(.close, label: "Limpiar búsqueda") { model.setQuery("") }
                }
            }
        } else if let business = model.visible {
            // Al pasar la portada, la barra muestra el nombre y el estado (CA-CAT-P5).
            // Siempre presente (si no, la barra enseña el título de navegación): invisible y oculto a VoiceOver hasta
            // que se pasa la portada.
            ToolbarItem(placement: .principal) {
                titleBar(business.name)
                    .opacity(model.showTitle ? 1 : 0)
                    .accessibilityHidden(!model.showTitle)
            }
            ToolbarItem(placement: .topBarTrailing) {
                TindivoIconButton(.search, label: "Buscar en la carta") { model.startSearch() }
                    .accessibilityIdentifier("menu.searchButton")
            }
        }
    }

    private func titleBar(_ name: String) -> some View {
        VStack(spacing: 0) {
            Text(name)
                .tindivoText(TindivoTokens.Typography.chip)
                .foregroundStyle(Color.tindivo.ink)
                .lineLimit(1)
            if let status = model.statusLine {
                Text(status)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("business.titleBar")
    }

    private var searchField: some View {
        TextField(
            "",
            text: Binding(get: { model.query ?? "" }, set: { model.setQuery($0) }),
            prompt: Text(String(localized: "Buscar en \(model.visible?.name ?? "")"))
        )
        .tindivoText(TindivoTokens.Typography.body)
        .submitLabel(.search)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .focused($searchFocused)
        .task { searchFocused = true }
        .accessibilityIdentifier("menu.searchField")
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
