import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// La carta de un negocio: contador de cada plato, hoja de información, estado de la barra y secciones.
@MainActor
@Suite("Negocio: tarjetas, información y barra")
struct BusinessRequirementsTests {
    private let configurable = Fixture.item("combo", order: 2, groups: [
        Fixture.group("g", single: true, required: true, min: 1, max: 1, options: [Fixture.option("o")]),
    ])

    private func menu(schedule: [BusinessMenu.ScheduleDay] = Fixture.nightSchedule) -> BusinessMenu {
        Fixture.menu(
            [Fixture.category("c", [Fixture.item("simple"), configurable])], schedule: schedule
        )
    }

    private func loaded(
        _ menu: BusinessMenu, at date: Date = Fixture.tuesdayEvening, store: any CartStore = temporaryStore()
    ) async -> BusinessScreenModel {
        let model = makeBusinessModel(menu, clock: .fixed(date), cartStore: store)
        await model.load()
        return model
    }

    private func item(_ id: String, in model: BusinessScreenModel) throws -> MenuItem {
        try #require(model.visible?.categories.first?.items.first { $0.id == id })
    }

    // MARK: Contador en la tarjeta (CUS-CAT-029)

    @Test("CUS-CAT-029 un plato sin opciones y fuera de la bolsa ofrece «+»; con unidades, «− 1 +»")
    func simpleDishControl() async throws {
        let store = temporaryStore()
        let model = await loaded(menu(), store: store)
        let simple = try item("simple", in: model)
        #expect(model.control(for: simple) == .add)
        await model.increment(simple)
        #expect(await store.current()?.count == 1)
        let observer = Task { await model.observeCart() }
        await eventually { model.control(for: simple) == .stepper(quantity: 1, canIncrease: true) }
        await model.increment(simple)
        await eventually { model.control(for: simple) == .stepper(quantity: 2, canIncrease: true) }
        observer.cancel()
    }

    @Test("CUS-CAT-029 «−» resta y con la última unidad saca el plato de la bolsa; no hay «En bolsa · 1»")
    func decrementRemoves() async throws {
        let store = temporaryStore()
        let model = await loaded(menu(), store: store)
        let simple = try item("simple", in: model)
        let observer = Task { await model.observeCart() }
        await model.increment(simple)
        await model.increment(simple)
        await eventually { model.control(for: simple) == .stepper(quantity: 2, canIncrease: true) }
        await model.decrement(simple)
        await eventually { model.control(for: simple) == .stepper(quantity: 1, canIncrease: true) }
        await model.decrement(simple)
        await eventually { model.control(for: simple) == .add }
        #expect(await store.current() == nil)
        observer.cancel()
    }

    @Test("CUS-CAT-029 un plato con opciones dice «Elegir» y, con unidades en la bolsa, «En tu bolsa: N» y «Editar selección»")
    func configurableControl() async throws {
        let store = temporaryStore()
        let model = await loaded(menu(), store: store)
        let combo = try item("combo", in: model)
        #expect(model.control(for: combo) == .choose)
        let line = CartLine(
            itemId: "combo", name: "Plato combo", basePrice: dec("12.50"),
            modifiers: [CartModifier(optionId: "o", groupName: "Grupo g", optionName: "Opción o", price: 0)],
            note: nil, quantity: 2, imageURL: nil
        )
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: line)
        let observer = Task { await model.observeCart() }
        await eventually { model.control(for: combo) == .inBag(quantity: 2) }
        observer.cancel()
        model.chooseOptions(combo)
        #expect(model.openDish?.id == "combo")
    }

    @Test("CUS-CAT-029 la bolsa de otro restaurante no cuenta: «+» sobre ella abre la ficha, que sabe preguntar")
    func otherBusinessBag() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "otro", businessName: "Chifa", line: Fixture.line("simple"))
        let model = await loaded(menu(), store: store)
        let simple = try item("simple", in: model)
        let observer = Task { await model.observeCart() }
        await eventually { model.cart != nil }
        #expect(model.control(for: simple) == .add)
        await model.increment(simple)
        #expect(model.openDish?.id == "simple")
        #expect(await store.current()?.businessId == "otro", "no se tocó la bolsa del otro")
        observer.cancel()
    }

    @Test("CUS-CAT-029 cerrado, agotado o en modo catálogo la tarjeta no ofrece nada")
    func noControlWhenNotOrderable() async throws {
        let closed = await loaded(menu(), at: at("2026-07-07", "12:00"))
        #expect(try closed.control(for: item("simple", in: closed)) == nil)
        let soldOut = await loaded(Fixture.menu([Fixture.category("c", [Fixture.item("a", available: false)])]))
        #expect(try soldOut.control(for: item("a", in: soldOut)) == nil)
        let contact = await loaded(Fixture.menu([Fixture.category("c", [Fixture.item("a")])], capability: .catalogOnly))
        #expect(try contact.control(for: item("a", in: contact)) == nil)
    }

    // MARK: Hoja de información (CUS-CAT-004, CUS-CAT-027)

    @Test("CUS-CAT-027 la hoja de información se abre y se cierra, y trae la semana y los modos sin contacto")
    func infoSheet() async throws {
        let model = await loaded(menu())
        #expect(!model.isShowingInfo)
        model.showInfo()
        #expect(model.isShowingInfo)
        let info = try #require(model.info)
        #expect(info.week.count == 7)
        #expect(info.week.filter(\.isToday).map(\.name) == ["Martes"])
        #expect(info.modes == [.delivery(eta: nil), .pickup], "Fixture sin plazo: solo el modo")
        model.hideInfo()
        #expect(!model.isShowingInfo)
    }

    @Test("CUS-CAT-027 sin carta cargada no hay hoja que abrir")
    func infoNeedsMenu() {
        let model = BusinessScreenModel(
            id: "x", catalog: StubCatalog(), cartStore: temporaryStore(), clock: .fixed(Fixture.tuesdayEvening)
        )
        model.showInfo()
        #expect(!model.isShowingInfo)
        #expect(model.info == nil)
    }

    @Test("CUS-CAT-017 el plazo del negocio acompaña a «Delivery» en la hoja")
    func etaInInfo() async throws {
        var raw = menu()
        raw = BusinessMenu(
            business: .init(
                id: "negocio-1", name: "Don Lucho", accentColor: "F97316", primaryCapability: .catalogFull,
                estimatedEtaMin: 25, estimatedEtaMax: 40
            ),
            categories: raw.categories, schedule: raw.schedule
        )
        let model = await loaded(raw)
        #expect(model.info?.modes == [.delivery(eta: "25–40 min"), .pickup])
    }

    // MARK: Barra (CA-CAT-P5)

    @Test("CA-CAT-P5 la barra dice «Abierto · cierra 23:00» abierto y «Cerrado · abre …» cerrado")
    func statusLineInModel() async {
        let open = await loaded(menu())
        #expect(open.statusLine == "Abierto · cierra 23:00")
        let closed = await loaded(menu(), at: at("2026-07-07", "12:00"))
        #expect(closed.statusLine == "Cerrado · abre hoy 18:00")
        let none = await loaded(menu(schedule: []))
        #expect(none.statusLine == nil)
    }

    @Test("CA-CAT-P5 el modo catálogo no tiene estado de apertura en la barra")
    func statusLineContact() async {
        let model = await loaded(Fixture.menu(
            [Fixture.category("c", [Fixture.item("a")])], schedule: Fixture.nightSchedule, capability: .catalogOnly
        ))
        #expect(model.statusLine == nil)
    }

    @Test("A9 la fábrica arma el modelo del plato con el negocio de la carta, sin que la vista toque el entorno")
    func dishModelFactory() async throws {
        let model = await loaded(menu())
        let dish = model.makeDishModel(for: try item("simple", in: model))
        #expect(dish.item.id == "simple")
        await dish.add()
        #expect(dish.outcome == .added(capped: false))
    }

    // MARK: Secciones y búsqueda (A10, M8)

    @Test("A10 la barra de secciones aparece desde 2 secciones, el índice desde 5, y se esconde buscando")
    func sectionBarThresholds() async {
        func menu(_ count: Int) -> BusinessMenu {
            Fixture.menu((1...count).map { Fixture.category("c\($0)", order: $0, [Fixture.item("i\($0)")]) })
        }
        let one = await loaded(menu(1))
        #expect(one.sectionBar == nil)
        let two = await loaded(menu(2))
        #expect(two.sectionBar == .init(ids: ["c1", "c2"], names: ["Sección c1", "Sección c2"], selected: 0, showsIndex: false))
        let five = await loaded(menu(5))
        #expect(five.sectionBar?.showsIndex == true)
        five.startSearch()
        #expect(five.sectionBar == nil)
    }

    @Test("M8 la búsqueda se calcula al cambiar la consulta y no antes de tener dos caracteres útiles")
    func searchIsStored() async {
        let raw = Fixture.menu([Fixture.category("c", [Fixture.item("a", name: "Ceviche"), Fixture.item("b", order: 2, name: "Arroz")])])
        let model = await loaded(raw)
        #expect(model.searchResults.isEmpty)
        model.startSearch()
        model.setQuery("c")
        #expect(!model.hasSearchTerms)
        model.setQuery("cevi")
        #expect(model.hasSearchTerms)
        #expect(model.searchResults.map(\.item.id) == ["a"])
        model.closeSearch()
        #expect(model.searchResults.isEmpty)
    }
}
