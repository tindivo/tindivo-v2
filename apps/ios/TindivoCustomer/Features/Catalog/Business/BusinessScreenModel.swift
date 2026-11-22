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
    /// Hubo un 426: la pantalla de actualización es de otra fase, la raíz lo leerá de aquí.
    private(set) var upgradeNotice: UpgradeNotice?

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
    /// Lo que se ve de la búsqueda: se recalcula al cambiar la consulta o la carta, no en cada dibujo de la pantalla.
    private(set) var searchResults: [MenuHit] = []
    private(set) var hasSearchTerms = false
    /// «Abierto · cierra 23:00» / «Cerrado · abre hoy 18:00»; `nil` sin horario o en modo catálogo (CA-CAT-P5).
    private(set) var statusLine: String?
    /// La hoja «Información» está abierta (CUS-CAT-027).
    private(set) var isShowingInfo = false

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
            upgradeNotice = nil
            if let detail = MenuMapping.detail(from: menu) {
                state = .loaded(detail)
            } else {
                state = .failed(.unknown(code: nil, detail: MenuMapping.invalidMenuDetail, status: nil))
            }
        } catch .cancelled {
            state = .idle
        } catch {
            upgradeNotice = UpgradeNotice(error)
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
        statusLine = detail.flatMap { detail in
            detail.catalogOnly ? nil : openStatusLine(openStatus(days: detail.schedule, now: now, openingConfirmed: detail.openingConfirmed), now: now)
        }
        rows = detail.map(menuRows(for:)) ?? []
        headerIndices = categoryHeaderIndices(rows)
        selectedSection = min(selectedSection, max(0, headerIndices.count - 1))
        if let detail, let openDishID, Self.findDish(in: detail, id: openDishID) == nil {
            // Un plato apagado por su franja no se abre: si se apaga con la ficha abierta, esta se cierra sola.
            self.openDishID = nil
        }
        if detail == nil { query = nil }
        updateSearch()
    }

    /// La barra «Ver mi bolsa» de ESTE negocio, o `nil` si la bolsa es de otro o no hay.
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
    /// Desde cuántas secciones aparece la barra de secciones.
    static let chipsMinSections = 2

    /// La barra de secciones: `nil` con una sola sección o mientras se busca. `showsIndex`: desde 5 secciones.
    struct SectionBar: Equatable {
        let names: [String]
        let selected: Int
        let showsIndex: Bool
    }

    var sectionBar: SectionBar? {
        guard let sections = visible?.sections, sections.count >= Self.chipsMinSections, !isSearching else { return nil }
        return SectionBar(
            names: sections.map(\.name), selected: selectedSection, showsIndex: sections.count >= Self.indexMinSections
        )
    }

    // MARK: Información del negocio

    func showInfo() {
        guard visible != nil else { return }
        isShowingInfo = true
    }

    func hideInfo() {
        isShowingInfo = false
    }

    /// Lo de la hoja «Información»: el horario semanal con hoy resaltado y cómo se recibe el pedido, sin contacto.
    var info: BusinessInfo? {
        visible.map { detail in
            BusinessInfo(
                name: detail.name,
                modes: deliveryModes(capability: detail.capability, etaMin: detail.etaMin, etaMax: detail.etaMax),
                week: weekSchedule(days: detail.schedule, now: now),
                status: statusLine
            )
        }
    }

    // MARK: El contador de cada plato (CUS-CAT-029)

    /// Lo que la tarjeta de un plato ofrece según lo que ya hay en la bolsa de ESTE negocio; `nil` si no se puede
    /// pedir (cerrado, modo catálogo, agotado o fuera de franja).
    func control(for item: MenuItem) -> DishRowControl? {
        guard ordering.allowsBag, item.orderable else { return nil }
        let units = unitsInBag(of: item)
        if item.isConfigurable { return units > 0 ? .inBag(quantity: units) : .choose }
        return units > 0 ? .stepper(quantity: units, canIncrease: units < CartLimits.maxQuantity) : .add
    }

    private func unitsInBag(of item: MenuItem) -> Int {
        guard let cart, let id = visible?.id, cart.businessId.caseInsensitiveCompare(id) == .orderedSame else { return 0 }
        return cart.lines.filter { $0.itemId == item.id }.reduce(0) { $0 + $1.quantity }
    }

    /// El «+» de un plato sin opciones: suma una unidad. Si la bolsa es de otro restaurante abre la ficha, que sabe
    /// preguntar si se vacía; si está llena o no se pudo guardar, lo dice con un aviso.
    func increment(_ item: MenuItem) async {
        guard ordering.allowsBag, item.orderable, let detail = visible,
              let line = DishSelection(dish: item.dish).toLine() else { return }
        do throws(CartError) {
            switch try await cartStore.add(businessId: detail.id, businessName: detail.name, line: line) {
            case let .added(_, capped): if capped { notices.show(DishScreenModel.addedMessage(capped: true)) }
            case .otherBusiness: openDishID = item.id
            case .full: notices.show(DishScreenModel.fullMessage)
            }
        } catch {
            notices.show(DishScreenModel.failedMessage)
        }
    }

    /// El «−» de un plato sin opciones: resta una unidad y, con la última, lo saca de la bolsa.
    func decrement(_ item: MenuItem) async {
        guard let line = DishSelection(dish: item.dish).toLine() else { return }
        let units = unitsInBag(of: item)
        do throws(CartError) {
            if units > 1 {
                try await cartStore.setQuantity(signature: line.signature, quantity: units - 1)
            } else if units == 1 {
                try await cartStore.remove(signature: line.signature)
            }
        } catch {
            notices.show(DishScreenModel.failedMessage)
        }
    }

    /// «Elegir» y «Editar selección»: abren la ficha del plato.
    func chooseOptions(_ item: MenuItem) {
        open(item)
    }
}

/// Lo que la tarjeta de un plato ofrece junto a la foto (CUS-CAT-029).
enum DishRowControl: Sendable, Equatable {
    /// Plato sin opciones y nada en la bolsa: un «+».
    case add
    /// Plato sin opciones con unidades en la bolsa: «− 1 +».
    case stepper(quantity: Int, canIncrease: Bool)
    /// Plato con opciones y nada en la bolsa: «Elegir».
    case choose
    /// Plato con opciones con unidades en la bolsa: «En tu bolsa: N» y «Editar selección».
    case inBag(quantity: Int)
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
