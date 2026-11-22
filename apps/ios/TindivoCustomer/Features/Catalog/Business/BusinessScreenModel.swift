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
    /// El aviso «Añadido a tu bolsa», que se apaga solo.
    let notices: TimedNotice
    private(set) var cart: Cart?
    /// La sección marcada en los chips: sigue a la carta al hacer scroll y salta al tocar un chip.
    private(set) var selectedSection = 0
    private(set) var showTitle = false

    /// Lo derivado de la carta y del instante `now`: se recalcula al cargar y cada minuto.
    private(set) var visible: BusinessDetail?
    private(set) var ordering: OrderingMode = .open
    private(set) var rows: [MenuRow] = []

    private let id: String
    private let catalog: any CatalogRepository
    private let cartStore: any CartStore
    private let clock: AppClock
    private var now: Date
    private var inFlight = false
    private var headerIndices: [Int] = []
    private var suppressSpyUntil: Date?

    init(id: String, catalog: any CatalogRepository, cartStore: any CartStore, clock: AppClock) {
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
        case .idle, .failed: await refresh()
        case .loading, .loaded: break
        }
    }

    /// Vuelve a pedir la carta. Si ya hay una carga en curso, no lanza otra.
    func refresh() async {
        guard !inFlight else { return }
        inFlight = true
        defer { inFlight = false }
        state = .loading
        recompute()
        do throws(AppError) {
            let menu = try await catalog.getBusiness(id: id)
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
        rows = detail.map(menuRows(for:)) ?? []
        headerIndices = categoryHeaderIndices(rows)
        selectedSection = min(selectedSection, max(0, headerIndices.count - 1))
        if let detail, let openDishID, Self.findDish(in: detail, id: openDishID) == nil {
            // Un plato apagado por su franja no se abre: si se apaga con la ficha abierta, esta se cierra sola.
            self.openDishID = nil
        }
        if detail == nil { query = nil }
    }

    /// La barra «Ver mi bolsa» de ESTE negocio, o `nil` si la bolsa es de otro o no hay.
    var cartBarSummary: CartBarSummary? {
        visible.flatMap { cartBar(for: cart, businessId: $0.id) }
    }

    // MARK: Búsqueda

    var isSearching: Bool { query != nil && visible != nil }

    /// Hay algo que buscar: con menos de dos caracteres útiles se sigue viendo la carta.
    var hasSearchTerms: Bool { !parseTerms(query ?? "").isEmpty }

    /// Los platos que casan con la consulta, sobre la carta que se ve (ya filtrada por franja).
    var searchResults: [MenuHit] {
        guard let visible, let query else { return [] }
        return searchMenu(visible.categories, query: query)
    }

    func startSearch() {
        guard visible != nil else { return }
        query = ""
    }

    func closeSearch() {
        query = nil
    }

    func setQuery(_ text: String) {
        guard query != nil else { return }
        query = text
    }

    // MARK: La ficha del plato

    /// El plato abierto, si sigue pudiéndose pedir.
    var openDish: MenuItem? {
        visible.flatMap { detail in openDishID.flatMap { Self.findDish(in: detail, id: $0) } }
    }

    /// Tocar un plato abre su ficha solo si el negocio deja pedir y el plato se puede pedir; si no, nada.
    func open(_ item: MenuItem) {
        guard ordering.allowsBag, item.orderable else { return }
        openDishID = item.id
    }

    func closeDish() {
        openDishID = nil
    }

    /// Lo que pasó después de «Agregar»: la ficha se cierra y la carta enseña el aviso.
    func dishAdded(capped: Bool) {
        openDishID = nil
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
        selectedSection = activeCategoryIndex(headerIndices: headerIndices, firstVisibleIndex: index)
    }

    /// Tocar un chip: marca la sección y devuelve la fila a la que hay que llevar la carta.
    func jump(toSection section: Int) -> String? {
        guard let header = headerIndices[safe: section], let row = rows[safe: header] else { return nil }
        selectedSection = section
        suppressSpyUntil = clock.now().addingTimeInterval(Self.jumpGrace)
        return row.key
    }

    /// Desde cuántas secciones aparece el botón del índice (D-61).
    static let indexMinSections = 5
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
