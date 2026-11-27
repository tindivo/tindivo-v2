import Foundation
import Observation
import TindivoAPI

/// Negocio: la carta de un restaurante, su búsqueda, qué se puede hacer con ella ahora (pedir, mirar, contactar) y la
/// barra de la bolsa. Lo que se elige en la ficha de un plato vive en `DishScreenModel`.
@MainActor
@Observable
final class BusinessScreenModel {
    enum State: Equatable {
        /// Aún no se pidió nada (o la pantalla se fue a medio camino): se ve igual que `loading`.
        case idle
        case loading
        /// La carta completa y ya validada, sin filtrar por franja.
        case loaded(BusinessDetail)
        case failed(AppError)
    }

    /// Cada cuánto se vuelve a decidir qué platos tocan y si el negocio está abierto.
    static let recheckEvery = Duration.seconds(60)
    /// Mientras dura un salto de un chip a una sección, la carta pasa por las del medio: el spy no las sigue.
    static let jumpGrace: TimeInterval = 0.9

    private(set) var state: State = .idle

    /// `nil` = no se busca; un texto, aunque vacío, es el modo búsqueda.
    private(set) var query: String?
    private(set) var openDishID: String?
    /// El modelo de la ficha abierta: se arma al abrir, una sola vez, no cada vez que la vista se dibuja.
    private(set) var dishModel: DishScreenModel?
    /// El aviso «Agregado a tu bolsa», que se apaga solo.
    let notices: TimedNotice
    private(set) var cart: Cart?
    /// La sección marcada en los chips: sigue a la carta al hacer scroll y salta al tocar un chip.
    /// La sección elegida se recuerda por su id, no por su posición: si «Destacados» aparece o desaparece, la elegida no cambia.
    private var selectedSectionID: String?
    var selectedSection: Int {
        let ids = visible?.sections.map(\.id) ?? []
        return selectedSectionID.flatMap { ids.firstIndex(of: $0) } ?? 0
    }
    private(set) var showTitle = false

    /// Lo derivado de la carta y del instante `now`: se recalcula al cargar y cada minuto.
    private(set) var visible: BusinessDetail?
    private(set) var ordering: OrderingMode = .open
    private(set) var rows: [MenuRow] = []
    /// Lo que se ve de la búsqueda: se recalcula al cambiar la consulta o la carta, no en cada dibujo de la pantalla.
    private(set) var searchResults: [MenuHit] = []
    private(set) var hasSearchTerms = false
    /// «Abierto · cierra 23:00» / «Cerrado · abre hoy 18:00»; `nil` sin horario o en modo catálogo (CA-CAT-P5).
    private(set) var statusLine: String?

    private let id: String
    private let catalog: any CatalogRepository
    private let cartStore: any CartStore
    private let clock: AppClock
    private let menuCache: BusinessMenuCache?
    private var now: Date
    private var inFlight = false
    private var headerIndices: [Int] = []
    private var suppressSpyUntil: Date?

    init(
        id: String, catalog: any CatalogRepository, cartStore: any CartStore, clock: AppClock,
        menuCache: BusinessMenuCache? = nil
    ) {
        self.menuCache = menuCache
        self.id = id
        self.catalog = catalog
        self.cartStore = cartStore
        self.clock = clock
        now = clock.now()
        notices = TimedNotice(clock: clock)
    }

    // MARK: Carga

    /// La primera carga de la pantalla; si ya hay carta no pide otra (volver de la bolsa no recarga).
    func load() async {
        switch state {
        case .idle, .failed: await refresh(reusingCache: true)
        case .loading, .loaded: break
        }
    }

    /// Vuelve a pedir la carta. Si ya hay una carga en curso, no lanza otra.
    /// `reusingCache`: la primera carga reusa la carta que Inicio ya bajó; «Reintentar» y recargar piden una nueva.
    func refresh(reusingCache: Bool = false) async {
        guard !inFlight else { return }
        inFlight = true
        defer { inFlight = false }
        state = .loading
        recompute()
        do throws(AppError) {
            let menu = try await fetchMenu(reusingCache: reusingCache)
            if let detail = MenuMapping.detail(from: menu) {
                state = .loaded(detail)
            } else {
                state = .failed(.unknown(code: nil, detail: MenuMapping.invalidMenuDetail, status: nil))
            }
        } catch .cancelled {
            state = .idle
        } catch {
            state = .failed(error)
        }
        recompute()
    }

    private func fetchMenu(reusingCache: Bool) async throws(AppError) -> BusinessMenu {
        guard let menuCache else { return try await catalog.getBusiness(id: id) }
        if reusingCache { return try await menuCache.menu(id: id, catalog: catalog, now: clock.now()) }
        let menu = try await catalog.getBusiness(id: id)
        await menuCache.store(menu, id: id, now: clock.now())
        return menu
    }

    /// Reevalúa la apertura y las franjas cada minuto: a las 15:00 se apaga el plato de mediodía sin recargar. Se
    /// lanza con `.task`: dura lo que la pantalla esté a la vista.
    func runClock() async {
        advanceClock()
        while !Task.isCancelled {
            do { try await clock.sleep(Self.recheckEvery) } catch { return }
            advanceClock()
        }
    }

    private func advanceClock() {
        now = clock.now()
        recompute()
    }

    /// La bolsa vigente ahora y después cada vez que cambia. Se lanza con `.task`.
    func observeCart() async {
        for await current in await cartStore.updates() {
            cart = current
        }
    }

    // MARK: Lo derivado

    private func recompute() {
        let detail: BusinessDetail? = if case let .loaded(raw) = state { raw.atInstant(now) } else { nil }
        visible = detail
        ordering = detail.map { orderingMode(for: $0, now: now) } ?? .open
        statusLine = detail.flatMap { detail in
            detail.catalogOnly
                ? nil
                : openStatusLine(
                    openStatus(days: detail.schedule, now: now, openingConfirmed: detail.openingConfirmed), now: now)
        }
        rows = detail.map(menuRows(for:)) ?? []
        headerIndices = categoryHeaderIndices(rows)
        // Si la sección elegida ya no existe (desapareció «Destacados», por ejemplo), se vuelve a la primera.
        if let id = selectedSectionID, visible?.sections.contains(where: { $0.id == id }) != true {
            selectedSectionID = nil
        }
        if let detail, let openDishID, Self.findDish(in: detail, id: openDishID) == nil {
            // Un plato apagado por su franja no se abre: si se apaga con la ficha abierta, esta se cierra sola.
            self.openDishID = nil
            dishModel = nil
        }
        if detail == nil { query = nil }
        updateSearch()
    }

    /// Lo que se dice bajo el nombre de un negocio cerrado (CUS-CAT-012): la píldora «Cerrado ahora», como Android.
    /// Cuándo abre, o por qué no atiende hoy, lo dice la barra de abajo (`ClosedBarView`, con `ordering.closedDetail`).
    struct ClosedNotice: Equatable {
        let pill: String
    }

    /// `nil` si el negocio no está cerrado.
    var closedNotice: ClosedNotice? {
        guard case .closed = ordering else { return nil }
        return ClosedNotice(pill: OrderingMode.closedTitle)
    }

    /// La barra «Ver bolsa» de ESTE negocio, o `nil` si la bolsa es de otro o no hay.
    var cartBarSummary: CartBarSummary? {
        visible.flatMap { cartBar(for: cart, businessId: $0.id) }
    }

    // MARK: Búsqueda

    var isSearching: Bool { query != nil && visible != nil }

    /// Los platos que casan con la consulta, sobre la carta que se ve (ya filtrada por franja). `hasSearchTerms`: con
    /// menos de dos caracteres útiles se sigue viendo la carta.
    private func updateSearch() {
        guard let visible, let query else {
            searchResults = []
            hasSearchTerms = false
            return
        }
        hasSearchTerms = !parseTerms(query).isEmpty
        searchResults = searchMenu(visible.categories, query: query)
    }

    func startSearch() {
        guard visible != nil else { return }
        query = ""
        updateSearch()
    }

    func closeSearch() {
        query = nil
        updateSearch()
    }

    func setQuery(_ text: String) {
        guard query != nil else { return }
        query = text
        updateSearch()
    }

    // MARK: La ficha del plato

    /// El plato abierto, si sigue pudiéndose pedir.
    var openDish: MenuItem? {
        visible.flatMap { detail in openDishID.flatMap { Self.findDish(in: detail, id: $0) } }
    }

    /// Tocar un plato (la fila, o el «+» de «Destacados») abre su ficha solo si el negocio deja pedir y el plato se puede
    /// pedir; si no, nada.
    func open(_ item: MenuItem) {
        guard ordering.allowsBag, item.orderable else { return }
        openDishID = item.id
        dishModel = makeDishModel(for: item)
    }

    func closeDish() {
        openDishID = nil
        dishModel = nil
    }

    /// Lo que pasó después de «Agregar»: la ficha se cierra y se dice «Agregado a tu bolsa».
    func dishAdded(capped: Bool) {
        closeDish()
        notices.show(DishScreenModel.addedMessage(capped: capped))
    }

    private static func findDish(in detail: BusinessDetail, id: String) -> MenuItem? {
        detail.categories.lazy.flatMap(\.items).first { $0.id == id && $0.orderable }
    }

    // MARK: Chips y scroll

    /// La fila que queda arriba del todo cambió (viene de la posición del scroll).
    func topRowChanged(_ key: String?) {
        guard let key, let index = rows.firstIndex(where: { $0.key == key }) else { return }
        showTitle = index > businessHeaderIndex(rows)
        if let until = suppressSpyUntil, clock.now() < until { return }
        suppressSpyUntil = nil
        selectedSectionID =
            visible?.sections[safe: activeCategoryIndex(headerIndices: headerIndices, firstVisibleIndex: index)]?.id
    }

    /// Tocar un chip: marca la sección y devuelve la fila a la que hay que llevar la carta.
    func jump(toSection section: Int) -> String? {
        guard let header = headerIndices[safe: section], let row = rows[safe: header] else { return nil }
        selectedSectionID = visible?.sections[safe: section]?.id
        suppressSpyUntil = clock.now().addingTimeInterval(Self.jumpGrace)
        return row.key
    }

    /// Desde cuántas secciones aparece el botón del índice (D-61).
    static let indexMinSections = 5
    /// Desde cuántas secciones aparece la barra de secciones.
    static let chipsMinSections = 2

    /// La barra de secciones: `nil` con una sola sección o mientras se busca. `showsIndex`: desde 5 secciones.
    struct SectionBar: Equatable {
        let ids: [String]
        let names: [String]
        let selected: Int
        let showsIndex: Bool
    }

    var sectionBar: SectionBar? {
        guard let sections = visible?.sections, sections.count >= Self.chipsMinSections, !isSearching else {
            return nil
        }
        return SectionBar(
            ids: sections.map(\.id), names: sections.map(\.name), selected: selectedSection,
            showsIndex: sections.count >= Self.indexMinSections
        )
    }

    /// El modelo de la ficha de un plato de ESTA carta (SW-4: la vista no conoce el entorno de la app).
    func makeDishModel(for item: MenuItem) -> DishScreenModel {
        DishScreenModel(
            item: item, businessId: visible?.id ?? "", businessName: visible?.name ?? "", cartStore: cartStore,
            clock: clock
        )
    }

}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
