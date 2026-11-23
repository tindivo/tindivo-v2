import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// `BusinessViewModelTest.kt` y la parte de Negocio de `BusinessCartViewModelTest.kt`.
@MainActor
@Suite("Negocio")
struct BusinessScreenModelTests {
    private func loaded(
        _ menu: BusinessMenu, at date: Date = Fixture.tuesdayEvening, cartStore: (any CartStore)? = nil
    ) async -> BusinessScreenModel {
        let model =
            cartStore.map { makeBusinessModel(menu, clock: .fixed(date), cartStore: $0) }
            ?? makeBusinessModel(menu, clock: .fixed(date))
        await model.load()
        return model
    }

    private let simple = Fixture.menu([Fixture.category("c1", [Fixture.item("i1"), Fixture.item("i2", order: 2)])])

    // MARK: Carga

    @Test("carga la carta ordenada, sin las secciones vacías")
    func loads() async throws {
        let menu = Fixture.menu([
            Fixture.category("c2", order: 2, [Fixture.item("b"), Fixture.item("a", order: 0)]),
            Fixture.category("vacia", order: 3, []),
            Fixture.category("c1", order: 1, [Fixture.item("x")]),
        ])
        let model = await loaded(menu)
        let detail = try #require(model.visible)
        #expect(detail.categories.map(\.id) == ["c1", "c2"])
        #expect(detail.categories[1].items.map(\.id) == ["a", "b"])
        #expect(model.state == .loaded(detail))
    }

    @Test("un 404 queda en error con not_found")
    func notFound() async {
        let error = AppError.known(code: .notFound, status: 404, detail: nil, fieldMessage: nil)
        let model = BusinessScreenModel(
            id: "x", catalog: StubCatalog(menus: Script(failing: error)),
            cartStore: AppEnvironment.test().cartStore, clock: .fixed(Fixture.tuesdayEvening)
        )
        await model.load()
        #expect(model.state == .failed(error))
        #expect(model.visible == nil)
    }

    @Test("426: la carta queda en error; la pantalla de actualización la decide la raíz (ConfigService)")
    func upgrade() async {
        let model = BusinessScreenModel(
            id: "x", catalog: StubCatalog(menus: Script(failing: .upgradeRequired(minVersion: "2.0.0"))),
            cartStore: AppEnvironment.test().cartStore, clock: .fixed(Fixture.tuesdayEvening)
        )
        await model.load()
        #expect(model.state == .failed(.upgradeRequired(minVersion: "2.0.0")))
    }

    @Test("un precio fuera de numeric(10,2) deja la carta entera en error")
    func invalidMenu() async {
        let menu = Fixture.menu([Fixture.category("c", [Fixture.item("a", price: "123456789.00")])])
        let model = await loaded(menu)
        #expect(model.state == .failed(.unknown(code: nil, detail: MenuMapping.invalidMenuDetail, status: nil)))
    }

    @Test("Reintentar tras un fallo vuelve a pedir la carta")
    func retry() async {
        let catalog = StubCatalog(menus: Script([.failure(.network), .success(simple)]))
        let model = BusinessScreenModel(
            id: "x", catalog: catalog, cartStore: AppEnvironment.test().cartStore, clock: .fixed(Fixture.tuesdayEvening)
        )
        await model.load()
        #expect(model.state == .failed(.network))
        await model.refresh()
        #expect(model.visible != nil)
    }

    @Test("una cancelación no se muestra como error y deja volver a cargar")
    func cancelled() async {
        let catalog = StubCatalog(menus: Script([.failure(.cancelled), .success(simple)]))
        let model = BusinessScreenModel(
            id: "x", catalog: catalog, cartStore: AppEnvironment.test().cartStore, clock: .fixed(Fixture.tuesdayEvening)
        )
        await model.load()
        #expect(model.state == .idle)
        await model.load()
        #expect(model.visible != nil)
    }

    @Test("volver a la pantalla con la carta cargada no la vuelve a pedir")
    func loadOnlyOnce() async {
        let menus = Script(just: simple)
        let model = BusinessScreenModel(
            id: "x", catalog: StubCatalog(menus: menus), cartStore: AppEnvironment.test().cartStore,
            clock: .fixed(Fixture.tuesdayEvening)
        )
        await model.load()
        await model.load()
        #expect(menus.calls == 1)
    }

    @Test("una carga en curso no deja lanzar otra")
    func noSecondLoad() async {
        let gate = Gate()
        let menus = Script(just: simple)
        let model = BusinessScreenModel(
            id: "x", catalog: StubCatalog(menus: menus, gate: gate), cartStore: AppEnvironment.test().cartStore,
            clock: .fixed(Fixture.tuesdayEvening)
        )
        let first = Task { await model.refresh() }
        await eventually { model.state == .loading }
        await model.refresh()
        #expect(menus.calls == 1)
        gate.open()
        await first.value
        #expect(model.visible != nil)
    }

    // MARK: Franjas y apertura

    private let windowMenu = Fixture.menu([
        Fixture.category(
            "c",
            [
                Fixture.item("lunch", days: [0, 1, 2, 3, 4, 5, 6], from: "11:00", to: "15:00"),
                Fixture.item("always", order: 2),
                Fixture.item("out", order: 3, available: false),
            ])
    ])

    @Test("CA-CAT-01 un plato fuera de su franja sigue en la carta, apagado y diciendo cuándo vuelve")
    func outsideWindow() async throws {
        let model = await loaded(windowMenu, at: at("2026-07-07", "20:00"))
        let items = try #require(model.visible?.categories.first?.items)
        #expect(items.map(\.id) == ["lunch", "always", "out"])
        #expect(items[0].outsideWindow != nil)
        #expect(!items[0].orderable)
        #expect(items[1].orderable)
        // Agotado no es «fuera de franja»: no se pisa.
        #expect(items[2].outsideWindow == nil)
        #expect(!items[2].orderable)
    }

    @Test("CA-CAT-01 al pasar el minuto el plato se apaga sin recargar")
    func minuteTick() async throws {
        let manual = ManualClock(at("2026-07-07", "14:59"))
        let model = makeBusinessModel(windowMenu, clock: manual.clock)
        await model.load()
        #expect(model.visible?.categories.first?.items.first?.orderable == true)

        let clockTask = Task { await model.runClock() }
        // Que el bucle llegue a dormir antes de mover la hora, y que vuelva a dormir (ya reaccionó) después.
        await manual.waitForSleep(number: 1)
        manual.set(at("2026-07-07", "15:00"))
        await manual.waitForSleep(number: 2)
        #expect(model.visible?.categories.first?.items.first?.orderable == false)
        clockTask.cancel()
        _ = await clockTask.value
    }

    @Test("cerrado la carta se ve y no se abre un plato; dice cuándo abre")
    func closedBlocksDishes() async throws {
        let menu = Fixture.menu([Fixture.category("c", [Fixture.item("i1")])], schedule: Fixture.nightSchedule)
        let model = await loaded(menu, at: at("2026-07-07", "12:00"))
        guard case let .closed(status, _) = model.ordering else {
            Issue.record("se esperaba .closed: \(model.ordering)")
            return
        }
        #expect(status == ClosedStatus(opensAt: "18:00", daysAhead: 0))
        let item = try #require(model.visible?.categories.first?.items.first)
        model.open(item)
        #expect(model.openDish == nil)
    }

    @Test("el modo catálogo se contacta por WhatsApp y no abre fichas, aunque el horario esté cerrado")
    func contactMode() async throws {
        let menu = Fixture.menu(
            [Fixture.category("c", [Fixture.item("i1")])], schedule: Fixture.nightSchedule,
            capability: .catalogOnly, whatsapp: "+51987654321"
        )
        let model = await loaded(menu, at: at("2026-07-07", "12:00"))
        #expect(model.ordering == .contact(whatsappNumber: "+51987654321"))
        let item = try #require(model.visible?.categories.first?.items.first)
        model.open(item)
        #expect(model.openDish == nil)
    }

    // MARK: La ficha

    @Test("abierto: tocar un plato pedible abre la ficha; uno agotado o fuera de franja, no")
    func openDish() async throws {
        let model = await loaded(windowMenu, at: at("2026-07-07", "20:00"))
        let items = try #require(model.visible?.categories.first?.items)
        model.open(items[0])
        #expect(model.openDish == nil)
        model.open(items[2])
        #expect(model.openDish == nil)
        model.open(items[1])
        #expect(model.openDish?.id == "always")
        model.closeDish()
        #expect(model.openDish == nil)
    }

    @Test("la ficha abierta se cierra sola si el plato se apaga por su franja")
    func dishClosesWhenWindowEnds() async throws {
        let manual = ManualClock(at("2026-07-07", "14:59"))
        let model = makeBusinessModel(windowMenu, clock: manual.clock)
        await model.load()
        let lunch = try #require(model.visible?.categories.first?.items.first)
        model.open(lunch)
        #expect(model.openDish?.id == "lunch")

        let clockTask = Task { await model.runClock() }
        await manual.waitForSleep(number: 1)
        manual.set(at("2026-07-07", "15:00"))
        await manual.waitForSleep(number: 2)
        #expect(model.openDish == nil)
        clockTask.cancel()
        _ = await clockTask.value
    }

    @Test("agregado: la ficha se cierra y la carta enseña «Añadido a tu bolsa», que se apaga solo")
    func addedNotice() async throws {
        let gate = Gate()
        let model = makeBusinessModel(simple, clock: .fixed(Fixture.tuesdayEvening, sleepsUntil: gate))
        await model.load()
        let item = try #require(model.visible?.categories.first?.items.first)
        model.open(item)
        model.dishAdded(capped: false)
        #expect(model.openDish == nil)
        #expect(model.notices.message == "Añadido a tu bolsa")
        gate.open()
        await eventually { model.notices.message == nil }
    }

    @Test("pasarse de 50 avisa que se topó")
    func cappedNotice() async {
        let model = await loaded(simple)
        model.dishAdded(capped: true)
        #expect(model.notices.message == "Ya tienes 50 de este plato: es el máximo por pedido")
    }

}

extension BusinessScreenModelTests {
    // MARK: Búsqueda

    private var searchMenu: BusinessMenu {
        Fixture.menu([
            Fixture.category(
                "c1", name: "Pollos",
                [
                    Fixture.item("p1", description: "Con papas", name: "Pollo a la brasa"),
                    Fixture.item("p2", order: 2, name: "Pollo broaster"),
                ]),
            Fixture.category("c2", order: 2, name: "Bebidas", [Fixture.item("b1", name: "Chicha morada")]),
        ])
    }

    @Test("buscar: la lupa abre, escribir filtra, vaciar vuelve a la carta y salir la cierra")
    func search() async {
        let model = await loaded(searchMenu)
        #expect(!model.isSearching)
        model.startSearch()
        #expect(model.isSearching)
        #expect(!model.hasSearchTerms)
        model.setQuery("pollo")
        #expect(model.hasSearchTerms)
        #expect(model.searchResults.map(\.item.id) == ["p1", "p2"])
        model.setQuery("chicha")
        #expect(model.searchResults.map(\.item.id) == ["b1"])
        model.setQuery("")
        #expect(!model.hasSearchTerms)
        model.closeSearch()
        #expect(!model.isSearching)
    }

    @Test("buscar sin resultados: hay términos y no hay platos")
    func searchEmpty() async {
        let model = await loaded(searchMenu)
        model.startSearch()
        model.setQuery("sushi")
        #expect(model.hasSearchTerms)
        #expect(model.searchResults.isEmpty)
    }

    @Test("un solo carácter no busca todavía")
    func searchNeedsTwoCharacters() async {
        let model = await loaded(searchMenu)
        model.startSearch()
        model.setQuery("p")
        #expect(!model.hasSearchTerms)
    }

    @Test("buscar se hace sobre lo que se ve: un plato recién apagado por su franja sigue saliendo, apagado")
    func searchSeesWindowState() async throws {
        let model = await loaded(windowMenu, at: at("2026-07-07", "20:00"))
        model.startSearch()
        model.setQuery("plato")
        let lunch = try #require(model.searchResults.first { $0.item.id == "lunch" })
        #expect(!lunch.item.orderable)
    }

    @Test("sin carta no se puede buscar")
    func noSearchWithoutMenu() {
        let model = BusinessScreenModel(
            id: "x", catalog: UnusedCatalogRepository(), cartStore: AppEnvironment.test().cartStore,
            clock: .fixed(Fixture.tuesdayEvening)
        )
        model.startSearch()
        #expect(!model.isSearching)
    }

    // MARK: La barra de la bolsa

    @Test("la barra suma unidades y subtotal de la bolsa de este negocio")
    func cartBarForThisBusiness() async throws {
        let store = FileCartStore(
            fileURL: FileManager.default.temporaryDirectory.appending(path: "tindivo-test-\(UUID().uuidString)/c.json"))
        _ = try await store.add(
            businessId: "negocio-1", businessName: "Don Lucho", line: Fixture.line("i1", businessQuantity: 2))
        let model = await loaded(simple, cartStore: store)
        let observing = Task { await model.observeCart() }
        await eventually { model.cartBarSummary != nil }
        #expect(model.cartBarSummary?.count == 2)
        #expect(model.cartBarSummary?.subtotal.plain == "S/ 25.00")
        observing.cancel()
    }

    @Test("la barra solo sale si la bolsa es de este negocio")
    func cartBarOnlyForThisBusiness() async throws {
        let store = FileCartStore(
            fileURL: FileManager.default.temporaryDirectory.appending(path: "tindivo-test-\(UUID().uuidString)/c.json"))
        _ = try await store.add(businessId: "otro", businessName: "Otro", line: Fixture.line())
        let model = await loaded(simple, cartStore: store)
        let observing = Task { await model.observeCart() }
        await eventually { model.cart != nil }
        #expect(model.cartBarSummary == nil)
        observing.cancel()
    }

    @Test("la barra se actualiza cuando la bolsa cambia")
    func cartBarFollowsStore() async throws {
        let store = FileCartStore(
            fileURL: FileManager.default.temporaryDirectory.appending(path: "tindivo-test-\(UUID().uuidString)/c.json"))
        let model = await loaded(simple, cartStore: store)
        let observing = Task { await model.observeCart() }
        #expect(model.cartBarSummary == nil)
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: Fixture.line())
        await eventually { model.cartBarSummary?.count == 1 }
        try await store.clear()
        await eventually { model.cartBarSummary == nil }
        observing.cancel()
    }

    // MARK: Chips y scroll

    private var sectionsMenu: BusinessMenu {
        Fixture.menu(
            (1...6).map { Fixture.category("c\($0)", order: $0, [Fixture.item("i\($0)")]) },
            banner: "https://example.com/banner.jpg"
        )
    }

    @Test("las filas van en el orden de la carta: banner, cabecera y, por sección, título y platos")
    func rows() async {
        let model = await loaded(sectionsMenu)
        #expect(model.rows.prefix(4).map(\.key) == ["banner", "header", "category-c1", "c1-i1"])
    }

    @Test("la sección marcada sigue a la fila de arriba y el título sale al pasar la cabecera")
    func spyFollowsScroll() async {
        let model = await loaded(sectionsMenu)
        #expect(!model.showTitle)
        model.topRowChanged("header")
        #expect(!model.showTitle)
        #expect(model.selectedSection == 0)
        model.topRowChanged("c3-i3")
        #expect(model.showTitle)
        #expect(model.selectedSection == 2)
        model.topRowChanged("category-c5")
        #expect(model.selectedSection == 4)
    }

    @Test("tocar un chip marca la sección, devuelve su cabecera y el spy no la pisa durante el salto")
    func jumpSuppressesSpy() async {
        let manual = ManualClock(Fixture.tuesdayEvening)
        let model = makeBusinessModel(sectionsMenu, clock: manual.clock)
        await model.load()
        #expect(model.jump(toSection: 3) == "category-c4")
        #expect(model.selectedSection == 3)
        // El scroll pasa por las secciones del medio: no se siguen.
        model.topRowChanged("c2-i2")
        #expect(model.selectedSection == 3)
        manual.advance(by: BusinessScreenModel.jumpGrace + 0.1)
        model.topRowChanged("c2-i2")
        #expect(model.selectedSection == 1)
    }

    @Test("un salto a una sección que no existe no hace nada")
    func jumpOutOfRange() async {
        let model = await loaded(sectionsMenu)
        #expect(model.jump(toSection: 99) == nil)
        #expect(model.selectedSection == 0)
    }

    @Test("Destacados es la primera sección y trae un carrusel")
    func featuredRows() async {
        let menu = Fixture.menu(
            [Fixture.category("c1", [Fixture.item("i1"), Fixture.item("i2", order: 2, image: "https://x/i2.jpg")])],
            featured: .init(title: "Los más pedidos", itemIds: ["i2"])
        )
        let model = await loaded(menu)
        #expect(model.rows.map(\.key) == ["header", "category-featured", "carousel", "category-c1", "c1-i1", "c1-i2"])
        #expect(model.visible?.sections.first?.name == "Los más pedidos")
    }
}

@Suite("Filas de la carta")
struct MenuRowsTests {
    @Test("la sección activa es la última cuya cabecera ya pasó; con la portada, la primera")
    func activeCategory() {
        #expect(activeCategoryIndex(headerIndices: [2, 5, 9], firstVisibleIndex: 0) == 0)
        #expect(activeCategoryIndex(headerIndices: [2, 5, 9], firstVisibleIndex: 2) == 0)
        #expect(activeCategoryIndex(headerIndices: [2, 5, 9], firstVisibleIndex: 6) == 1)
        #expect(activeCategoryIndex(headerIndices: [2, 5, 9], firstVisibleIndex: 99) == 2)
        #expect(activeCategoryIndex(headerIndices: [], firstVisibleIndex: 3) == 0)
    }

    @Test("resaltar recorta lo que se sale, descarta lo vacío o invertido y no parte un carácter")
    func highlight() {
        let text = "Pollo a la brasa"
        func marked(_ ranges: [MatchRange]) -> [String] {
            highlightRanges(in: text, ranges).map { String(text[$0]) }
        }
        #expect(marked([MatchRange(start: 0, end: 5)]) == ["Pollo"])
        #expect(marked([MatchRange(start: 11, end: 99)]) == ["brasa"])
        #expect(marked([MatchRange(start: 4, end: 4), MatchRange(start: 6, end: 2)]).isEmpty)
        #expect(marked([MatchRange(start: -3, end: 2)]) == ["Po"])
        // 😀 ocupa dos unidades UTF-16: un corte en medio no se pinta.
        let emoji = "a😀b"
        #expect(highlightRanges(in: emoji, [MatchRange(start: 2, end: 3)]).isEmpty)
        #expect(highlightRanges(in: emoji, [MatchRange(start: 1, end: 3)]).map { String(emoji[$0]) } == ["😀"])
    }
}
