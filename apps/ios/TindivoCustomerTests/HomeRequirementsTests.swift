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
        await model.enrichment?.value
        guard case let .loaded(loaded) = model.state else {
            Issue.record("se esperaba .loaded")
            return
        }
        let closed = try #require(loaded.listing.restaurants.first { $0.id == "a" })
        #expect(model.closedLabel(for: closed) == "Cerrado · abre hoy 18:00")
        #expect(model.schedules["b"] == nil, "un negocio abierto no pide su carta")
    }

    @Test("CA-CAT-P2 si la carta no llega, la tarjeta cerrada dice «Cerrado ahora» sin romper la lista")
    func closedCardFallback() async throws {
        let model = model([summary("a", open: false)])
        await model.load()
        await model.enrichment?.value
        guard case let .loaded(loaded) = model.state else {
            Issue.record("se esperaba .loaded")
            return
        }
        #expect(model.closedLabel(for: loaded.listing.restaurants[0]) == "Cerrado ahora")
    }

    // MARK: Workaround de las tarjetas cerradas (A1, A2)

    /// Una carta que cuenta cuántas peticiones están en vuelo a la vez.
    private final class CountingCatalog: CatalogRepository, @unchecked Sendable {
        private let lock = NSLock()
        private var current = 0
        private(set) var peak = 0
        private(set) var calls = 0
        let summaries: [BusinessSummary]
        let menu: BusinessMenu

        init(summaries: [BusinessSummary], menu: BusinessMenu) {
            self.summaries = summaries
            self.menu = menu
        }

        func listBusinesses() async throws(AppError) -> [BusinessSummary] { summaries }

        func getBusiness(id: String) async throws(AppError) -> BusinessMenu {
            lock.withLock { current += 1; calls += 1; peak = max(peak, current) }
            for _ in 0..<20 { await Task.yield() }
            lock.withLock { current -= 1 }
            return menu
        }
    }

    @Test("A1 Inicio pide como mucho 3 cartas a la vez para armar los «abre …» de las tarjetas cerradas")
    func closedMenusAreCapped() async {
        let summaries = (1...9).map { summary("n\($0)", open: false) }
        let catalog = CountingCatalog(
            summaries: summaries,
            menu: Fixture.menu([Fixture.category("c", [Fixture.item("i")])], schedule: Fixture.nightSchedule)
        )
        let model = CatalogHomeScreenModel(catalog: catalog, clock: .fixed(at("2026-07-07", "12:00")))
        await model.load()
        await model.enrichment?.value
        #expect(catalog.calls == 9)
        #expect(catalog.peak <= CatalogHomeScreenModel.maxConcurrentMenus)
        #expect(model.schedules.count == 9)
    }

    @Test("A1 la carta que Inicio bajó se reusa al abrir el negocio: una sola petición")
    func menuIsSharedWithTheBusiness() async throws {
        let menus = Script(just: Fixture.menu([Fixture.category("c", [Fixture.item("i")])], schedule: Fixture.nightSchedule))
        let catalog = StubCatalog(businesses: Script(just: [summary("negocio-1", open: false)]), menus: menus)
        let cache = BusinessMenuCache()
        let clock = AppClock.fixed(at("2026-07-07", "12:00"))
        let home = CatalogHomeScreenModel(catalog: catalog, clock: clock, menuCache: cache)
        await home.load()
        await home.enrichment?.value
        #expect(menus.calls == 1)
        let business = BusinessScreenModel(
            id: "negocio-1", catalog: catalog, cartStore: temporaryStore(), clock: clock, menuCache: cache
        )
        await business.load()
        #expect(business.visible != nil)
        #expect(menus.calls == 1, "Negocio reusó la carta de Inicio")
        await business.refresh()
        #expect(menus.calls == 2, "recargar pide una carta nueva")
    }

    @Test("A2 la tarjeta cerrada se reevalúa cada minuto: pasa de «abre hoy 18:00» a «Cerrado ahora» cuando ya abrió")
    func closedLabelFollowsTheClock() async throws {
        let manual = ManualClock(at("2026-07-07", "17:59"))
        let catalog = StubCatalog(
            businesses: Script(just: [summary("a", open: false)]),
            menus: Script(just: Fixture.menu([Fixture.category("c", [Fixture.item("i")])], schedule: Fixture.nightSchedule))
        )
        let model = CatalogHomeScreenModel(catalog: catalog, clock: manual.clock)
        await model.load()
        await model.enrichment?.value
        guard case let .loaded(loaded) = model.state else {
            Issue.record("se esperaba .loaded")
            return
        }
        let card = try #require(loaded.listing.restaurants.first)
        #expect(model.closedLabel(for: card) == "Cerrado · abre hoy 18:00")
        let task = Task { await model.runClock() }
        await manual.waitForSleep(number: 1)
        manual.set(at("2026-07-07", "18:01"))
        await manual.waitForSleep(number: 2)
        #expect(model.closedLabel(for: card) == "Cerrado ahora", "ya abrió: el servidor aún dice cerrado, la tarjeta no inventa hora")
        task.cancel()
    }
}
