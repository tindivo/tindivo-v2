import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// La carta de un negocio: contador de cada plato, hoja de información, estado de la barra y secciones.
@MainActor
@Suite("Negocio: tarjetas, información y barra")
struct BusinessRequirementsTests {
    private let configurable = Fixture.item(
        "combo", order: 2,
        groups: [
            Fixture.group("g", single: true, required: true, min: 1, max: 1, options: [Fixture.option("o")])
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
        let model = await loaded(
            Fixture.menu(
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
        #expect(
            two.sectionBar
                == .init(ids: ["c1", "c2"], names: ["Sección c1", "Sección c2"], selected: 0, showsIndex: false))
        let five = await loaded(menu(5))
        #expect(five.sectionBar?.showsIndex == true)
        five.startSearch()
        #expect(five.sectionBar == nil)
    }

    @Test("M8 la búsqueda se calcula al cambiar la consulta y no antes de tener dos caracteres útiles")
    func searchIsStored() async {
        let raw = Fixture.menu([
            Fixture.category("c", [Fixture.item("a", name: "Ceviche"), Fixture.item("b", order: 2, name: "Arroz")])
        ])
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

    // MARK: La ficha del plato (CUS-CAT-029)

    @Test("CUS-CAT-029 tocar un plato abre su ficha en blanco, y el modelo de la ficha se arma una sola vez al abrir")
    func openingADishBuildsItsModelOnce() async throws {
        let model = await loaded(menu())
        let combo = try item("combo", in: model)
        model.open(combo)
        #expect(model.openDish?.id == "combo")
        let first = try #require(model.dishModel)
        #expect(!first.isEditing)
        #expect(model.dishModel === first, "no se rearma al leerlo")
    }

    @Test("CUS-CAT-029 cerrado, agotado o en modo catálogo tocar el plato no abre nada")
    func tappingANonOrderableDishDoesNothing() async throws {
        let closed = await loaded(menu(), at: at("2026-07-07", "12:00"))
        closed.open(try item("simple", in: closed))
        #expect(closed.openDish == nil)
        let soldOut = await loaded(Fixture.menu([Fixture.category("c", [Fixture.item("a", available: false)])]))
        soldOut.open(try item("a", in: soldOut))
        #expect(soldOut.openDish == nil)
        let contact = await loaded(Fixture.menu([Fixture.category("c", [Fixture.item("a")])], capability: .catalogOnly))
        contact.open(try item("a", in: contact))
        #expect(contact.openDish == nil)
    }

    // MARK: Negocio cerrado (CUS-CAT-012, CUS-CAT-013)

    @Test("CUS-CAT-012 cerrado, la cabecera dice «Cerrado ahora» y la barra de abajo, «Abre hoy a las 18:00»")
    func closedNoticeWithHour() async {
        let closed = await loaded(menu(), at: at("2026-07-07", "12:00"))
        #expect(closed.closedNotice == .init(pill: "Cerrado ahora"))
        #expect(closed.ordering.closedDetail == "Abre hoy a las 18:00")
        let open = await loaded(menu())
        #expect(open.closedNotice == nil)
    }

    @Test("CUS-CAT-013 sin jornada confirmada la píldora dice «Cerrado ahora» y la barra explica por qué")
    func closedNoticeWithoutConfirmation() async {
        let unconfirmed = await loaded(
            Fixture.menu(
                [Fixture.category("c", [Fixture.item("a")])], schedule: Fixture.nightSchedule, openingConfirmed: false))
        #expect(unconfirmed.closedNotice == .init(pill: "Cerrado ahora"))
        #expect(unconfirmed.ordering.closedDetail == "Hoy este restaurante no ha confirmado que atiende")
    }

    @Test("CUS-CAT-015 en modo catálogo no hay aviso de cerrado")
    func noClosedNoticeInCatalogMode() async {
        let model = await loaded(
            Fixture.menu(
                [Fixture.category("c", [Fixture.item("a")])], schedule: Fixture.nightSchedule, capability: .catalogOnly)
        )
        #expect(model.closedNotice == nil)
    }
}
