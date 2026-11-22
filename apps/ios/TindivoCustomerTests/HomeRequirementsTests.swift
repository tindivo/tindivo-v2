import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// Inicio: la barra superior (bolsa y chip «Entregar en») y el texto de las tarjetas cerradas.
@MainActor
@Suite("Inicio: barra superior y negocios cerrados")
struct HomeRequirementsTests {
    private func model(
        _ summaries: [BusinessSummary] = [], menu: BusinessMenu? = nil, store: (any CartStore)? = nil,
        now: Date = Fixture.tuesdayEvening
    ) -> CatalogHomeScreenModel {
        let catalog = StubCatalog(
            businesses: Script(just: summaries), menus: menu.map { Script(just: $0) } ?? Script(failing: .network)
        )
        return CatalogHomeScreenModel(catalog: catalog, cartStore: store, clock: .fixed(now))
    }

    // MARK: Barra superior (CUS-CAT-030 ★)

    @Test("CUS-CAT-030 la bolsa de la barra existe también vacía: sin insignia y con «Bolsa» para VoiceOver")
    func emptyBag() {
        let model = model()
        #expect(model.bagCount == 0)
        #expect(model.bagBadgeText == nil)
        #expect(model.bagAccessibilityLabel == "Bolsa")
    }

    @Test("CUS-CAT-030 la bolsa cuenta unidades y sigue a la bolsa guardada; VoiceOver dice cuántos productos")
    func bagFollowsTheCart() async throws {
        let store = temporaryStore()
        let model = model(store: store)
        let observer = Task { await model.observeCart() }
        _ = try await store.add(businessId: "n", businessName: "Don Lucho", line: Fixture.line("a", businessQuantity: 1))
        await eventually { model.bagCount == 1 }
        #expect(model.bagAccessibilityLabel == "Bolsa, 1 producto")
        _ = try await store.add(businessId: "n", businessName: "Don Lucho", line: Fixture.line("b", businessQuantity: 2))
        await eventually { model.bagCount == 3 }
        #expect(model.bagBadgeText == "3")
        #expect(model.bagAccessibilityLabel == "Bolsa, 3 productos")
        try await store.clear()
        await eventually { model.bagCount == 0 }
        observer.cancel()
    }

    @Test("CUS-CAT-030 más de 99 unidades se muestran «99+»")
    func bigBag() async throws {
        let store = temporaryStore()
        let model = model(store: store)
        let observer = Task { await model.observeCart() }
        _ = try await store.add(businessId: "n", businessName: "Don Lucho", line: Fixture.line("a", businessQuantity: 50))
        _ = try await store.add(businessId: "n", businessName: "Don Lucho", line: Fixture.line("b", businessQuantity: 50))
        await eventually { model.bagCount == 100 }
        #expect(model.bagBadgeText == "99+")
        observer.cancel()
    }

    @Test("CUS-CAT-030 sin sesión ni direcciones el chip «Entregar en» no se muestra (ficha de Inicio)")
    func noChipForGuests() {
        #expect(model().deliveryAddress == nil)
    }

    // MARK: Cerrado (CA-CAT-P2)

    @Test("CA-CAT-P2 la tarjeta cerrada dice «Cerrado · abre [día] [hora]» con el horario de su carta")
    func closedCardSaysWhenItOpens() async throws {
        let model = model(
            [summary("a", open: false), summary("b", open: true)],
            menu: Fixture.menu([Fixture.category("c", [Fixture.item("i")])], schedule: Fixture.nightSchedule),
            now: at("2026-07-07", "12:00")
        )
        await model.load()
        await model.waitForClosedLabels()
        guard case let .loaded(loaded) = model.state else {
            Issue.record("se esperaba .loaded")
            return
        }
        let closed = try #require(loaded.listing.restaurants.first { $0.id == "a" })
        #expect(model.closedLabel(for: closed) == "Cerrado · abre hoy 18:00")
        #expect(model.closedLabels["b"] == nil, "un negocio abierto no pide su carta")
    }

    @Test("CA-CAT-P2 si la carta no llega, la tarjeta cerrada dice «Cerrado ahora» sin romper la lista")
    func closedCardFallback() async throws {
        let model = model([summary("a", open: false)])
        await model.load()
        await model.waitForClosedLabels()
        guard case let .loaded(loaded) = model.state else {
            Issue.record("se esperaba .loaded")
            return
        }
        #expect(model.closedLabel(for: loaded.listing.restaurants[0]) == "Cerrado ahora")
    }
}
