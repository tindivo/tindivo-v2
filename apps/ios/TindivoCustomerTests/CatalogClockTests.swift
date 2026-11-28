import Foundation
import Testing
import TindivoAPI

@testable import TindivoCustomer

/// Inicio y el reloj (workaround hasta que el servidor mande `next_change_at`): cuándo se vuelve a pedir la lista.
@MainActor
@Suite("Inicio y el reloj")
struct CatalogClockTests {
    private let menu = Fixture.menu([Fixture.category("c", [Fixture.item("i")])], schedule: Fixture.nightSchedule)

    private func started(_ businesses: Script<[BusinessSummary]>, manual: ManualClock) async -> CatalogHomeScreenModel {
        let catalog = StubCatalog(businesses: businesses, menus: Script(just: menu))
        let model = CatalogHomeScreenModel(catalog: catalog, clock: manual.clock)
        await model.load()
        await model.enrichment?.value
        return model
    }

    private func firstCard(_ model: CatalogHomeScreenModel) -> BusinessCard? {
        if case let .loaded(loaded) = model.state { loaded.listing.restaurants.first } else { nil }
    }

    @Test("1 si la lista en caché sigue diciendo «cerrado», se reintenta en el tic siguiente y se detiene al coincidir")
    func retriesWhileTheListContradictsTheClock() async {
        let manual = ManualClock(at("2026-07-07", "17:59"))
        let businesses = Script([
            .success([summary("a", open: false)]), .success([summary("a", open: false)]),
            .success([summary("a", open: true)]),
        ])
        let model = await started(businesses, manual: manual)
        let task = Task { await model.runClock() }
        await manual.waitForSleep(number: 1)
        manual.set(at("2026-07-07", "18:01"))
        await manual.waitForSleep(number: 2)
        #expect(businesses.calls == 2)
        #expect(firstCard(model)?.closed == true, "la segunda respuesta aún dice cerrado")
        manual.advance(by: 60)
        await manual.waitForSleep(number: 3)
        #expect(businesses.calls == 3)
        #expect(firstCard(model)?.closed == false)
        manual.advance(by: 60)
        await manual.waitForSleep(number: 4)
        #expect(businesses.calls == 3, "al coincidir deja de pedir")
        task.cancel()
    }

    @Test("1 como mucho dos reintentos por cambio, aunque la lista siga contradiciendo")
    func retriesAreBounded() async {
        let manual = ManualClock(at("2026-07-07", "17:59"))
        let businesses = Script(just: [summary("a", open: false)])
        let model = await started(businesses, manual: manual)
        let task = Task { await model.runClock() }
        await manual.waitForSleep(number: 1)
        manual.set(at("2026-07-07", "18:01"))
        for tick in 2...6 {
            await manual.waitForSleep(number: tick)
            manual.advance(by: 60)
        }
        await manual.waitForSleep(number: 7)
        #expect(businesses.calls == 4, "la carga inicial, la recarga por el cambio y dos reintentos")
        task.cancel()
    }

    @Test("2 si la recarga no se hizo porque había otra en curso, el cambio no se pierde")
    func aSkippedReloadKeepsTheChangePending() async {
        let manual = ManualClock(at("2026-07-07", "17:59"))
        let gate = Gate()
        let businesses = Script([
            .success([summary("a", open: false)]), .success([summary("a", open: false)]),
            .success([summary("a", open: true)]),
        ])
        let catalog = StubCatalog(
            businesses: businesses, menus: Script(just: menu), gate: gate, gatesMenus: false)
        let model = CatalogHomeScreenModel(catalog: catalog, clock: manual.clock)
        gate.open()
        await model.load()
        await model.enrichment?.value
        let manualRefresh = Task { await model.refresh() }
        await eventually { businesses.calls == 2 }
        manual.set(at("2026-07-07", "18:01"))
        let task = Task { await model.runClock() }
        await manual.waitForSleep(number: 1)
        #expect(businesses.calls == 2, "el tic no lanzó otra recarga")
        gate.open()
        await manualRefresh.value
        await model.enrichment?.value
        gate.open()
        manual.advance(by: 60)
        await manual.waitForSleep(number: 2)
        #expect(businesses.calls == 3, "el cambio sigue pendiente y se atiende en el tic siguiente")
        #expect(firstCard(model)?.closed == false)
        task.cancel()
    }

    @Test("3 al arrancar el reloj se compara una vez, sin esperar el minuto")
    func comparesOnceOnStart() async {
        let manual = ManualClock(at("2026-07-07", "17:59"))
        let businesses = Script([.success([summary("a", open: false)]), .success([summary("a", open: true)])])
        let model = await started(businesses, manual: manual)
        manual.set(at("2026-07-07", "18:01"))
        let task = Task { await model.runClock() }
        await manual.waitForSleep(number: 1)
        #expect(businesses.calls == 2)
        #expect(firstCard(model)?.closed == false)
        task.cancel()
    }

    @Test(
        "4 la carga inicial pide la lista y una carta por negocio (de tres en tres); la recarga por reloj, solo la lista"
    )
    func requestCounts() async {
        let manual = ManualClock(at("2026-07-07", "17:59"))
        let ids = ["a", "b", "c", "d", "e"]
        let catalog = HeldMenus(businesses: ids.map { summary($0, open: false) }, menu: menu)
        let model = CatalogHomeScreenModel(catalog: catalog, clock: manual.clock)
        await model.load()
        await eventually { catalog.waiting == 3 }
        #expect(catalog.peak == 3, "tres cartas a la vez")
        #expect(catalog.menuCalls == 3)
        catalog.releaseAll()
        await eventually { catalog.menuCalls == 5 }
        catalog.releaseAll()
        await model.enrichment?.value
        #expect(catalog.listCalls == 1)
        #expect(catalog.menuCalls == 5, "1 lista + 5 cartas")
        #expect(catalog.peak == 3)

        let task = Task { await model.runClock() }
        await manual.waitForSleep(number: 1)
        manual.set(at("2026-07-07", "18:01"))
        await manual.waitForSleep(number: 2)
        #expect(catalog.listCalls >= 2, "el cambio recargó la lista")
        #expect(catalog.menuCalls == 5, "la recarga por reloj no vuelve a pedir las cartas")
        #expect(model.schedules.count == 5, "conserva los horarios ya obtenidos")
        task.cancel()
    }

    @Test("5 una recarga automática que falla no muestra el error en la lista")
    func automaticFailureStaysSilent() async {
        let manual = ManualClock(at("2026-07-07", "17:59"))
        let businesses = Script([.success([summary("a", open: false)]), .failure(.network)])
        let model = await started(businesses, manual: manual)
        let task = Task { await model.runClock() }
        await manual.waitForSleep(number: 1)
        manual.set(at("2026-07-07", "18:01"))
        await manual.waitForSleep(number: 2)
        #expect(businesses.calls >= 2)
        guard case let .loaded(loaded) = model.state else {
            Issue.record("se esperaba .loaded: \(model.state)")
            return
        }
        #expect(loaded.refreshFailed == nil)
        #expect(!loaded.refreshing)
        #expect(loaded.listing.restaurants.map(\.id) == ["a"])
        task.cancel()
    }
}
