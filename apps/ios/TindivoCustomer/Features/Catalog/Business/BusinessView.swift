import SwiftUI
import TindivoAPI
import TindivoDesign

struct BusinessView: View {
    let model: BusinessScreenModel
    let environment: AppEnvironment
    let onOpenCart: () -> Void

    @State private var position: String?
    @State private var showingIndex = false
    @FocusState private var searchFocused: Bool

    var body: some View {
        content
            .background(Color.tindivo.background)
            .navigationBarTitleDisplayMode(.inline)
            .navigationTitle(model.showTitle && !model.isSearching ? (model.visible?.name ?? "") : "")
            .navigationBarBackButtonHidden(model.isSearching)
            .toolbar { toolbar }
            .tindivoToast(model.notices.message)
            .safeAreaInset(edge: .top, spacing: 0) { chips }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                OrderingBottomBar(ordering: model.ordering, cart: model.cartBarSummary, onOpenCart: onOpenCart)
            }
            .sheet(isPresented: $showingIndex) {
                SectionIndexSheet(sections: model.visible?.sections ?? []) { index in
                    showingIndex = false
                    jump(to: index)
                }
            }
            .fullScreenCover(item: openDish) { item in
                DishView(
                    model: DishScreenModel(
                        item: item, businessId: model.visible?.id ?? "", businessName: model.visible?.name ?? "",
                        cartStore: environment.cartStore, clock: environment.clock
                    ),
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
            if let business = model.visible { BusinessHeaderView(business: business) }
        case let .category(category):
            CategoryHeaderView(category: category)
        case let .carousel(items):
            FeaturedCarouselView(items: items, onTap: tap)
        case let .dish(item, _):
            MenuItemRowView(item: item, onTap: tap.map { tap in { tap(item) } })
        }
    }

    // MARK: Barra superior

    @ViewBuilder private var chips: some View {
        if let sections = model.visible?.sections, sections.count >= 2, !model.isSearching {
            SectionChipsBar(
                sections: sections,
                selected: model.selectedSection,
                onSelect: jump,
                onShowIndex: sections.count >= BusinessScreenModel.indexMinSections ? { showingIndex = true } : nil
            )
        }
    }

    private func jump(to section: Int) {
        guard let key = model.jump(toSection: section) else { return }
        withAnimation { position = key }
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
        } else if model.visible != nil {
            ToolbarItem(placement: .topBarTrailing) {
                TindivoIconButton(.search, label: "Buscar en la carta") { model.startSearch() }
                    .accessibilityIdentifier("menu.searchButton")
            }
        }
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
            environment: environment, onOpenCart: {}
        )
    }
    .onAppear { TindivoFonts.register() }
}
#endif
