import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// El botón «Continuar» de la bolsa (CUS-CRT-005, CUS-CRT-009, CUS-CRT-015; CA-CRT-07, CA-CRT-14, CA-CRT-15).
@MainActor
@Suite("Bolsa: Continuar")
struct CartContinueTests {
    private func line(_ id: String, price: String = "12.50", quantity: Int = 1) -> CartLine {
        CartLine(
            itemId: id, name: "Plato \(id)", basePrice: dec(price), modifiers: [], note: nil, quantity: quantity,
            imageURL: "https://example.test/\(id).jpg"
        )
    }

    private func menu(_ items: [BusinessMenu.Item], schedule: [BusinessMenu.ScheduleDay] = []) -> BusinessMenu {
        Fixture.menu([Fixture.category("c", items)], schedule: schedule)
    }

    private func started(
        _ store: any CartStore, catalog: any CatalogRepository, now: Date = Fixture.tuesdayEvening
    ) async -> (CartScreenModel, Task<Void, Never>) {
        let model = CartScreenModel(store: store, catalog: catalog, clock: ManualClock(now).clock)
        let task = Task { await model.observe() }
        await eventually { model.state != .loading }
        return (model, task)
    }

    private func filled(_ model: CartScreenModel) -> CartScreenModel.Filled? {
        if case let .filled(filled) = model.state { filled } else { nil }
    }

    private func storeWith(_ lines: [CartLine]) async throws -> FileCartStore {
        let store = temporaryStore()
        for line in lines { _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: line) }
        return store
    }

    @Test("mientras la carta no responde «Continuar» dice «Cargando…» y no avanza; al responder, avanza")
    func loading() async throws {
        let store = try await storeWith([line("a")])
        let gate = Gate()
        let catalog = StubCatalog(menus: Script(just: menu([Fixture.item("a")])), gate: gate)
        let (model, task) = await started(store, catalog: catalog)
        // La petición queda retenida en la compuerta: la revisión está en curso.
        let validation = Task { await model.validate() }
        #expect(filled(model)?.continueState == .loading)
        #expect(filled(model)?.continueState.advances == false)
        gate.open()
        await validation.value
        #expect(filled(model)?.continueState == .ready)
        task.cancel()
    }

    @Test("con la carta revisada y sin problemas «Continuar» avanza, con el mismo monto que el subtotal")
    func ready() async throws {
        let store = try await storeWith([line("a", quantity: 2), line("b")])
        let (model, task) = await started(
            store, catalog: StubCatalog(menus: Script(just: menu([Fixture.item("a"), Fixture.item("b")]))))
        await model.validate()
        let state = try #require(filled(model))
        #expect(state.continueState == .ready)
        #expect(state.continueState.advances)
        #expect(state.subtotal.plain == "S/ 37.50")
        task.cancel()
    }

    @Test("CA-CRT-14: con la carta caída dice «Reintentar» y no avanza; al responder vuelve a «Continuar»")
    func retry() async throws {
        let store = try await storeWith([line("a")])
        let menus = Script<BusinessMenu>([.failure(.network), .success(menu([Fixture.item("a")]))])
        let (model, task) = await started(store, catalog: StubCatalog(menus: menus))
        await model.validate()
        #expect(filled(model)?.continueState == .retry)
        #expect(filled(model)?.continueState.advances == false)
        await model.retryCheck()
        #expect(filled(model)?.continueState == .ready)
        task.cancel()
    }

    @Test("una línea con problema bloquea «Continuar»")
    func blockedByAnIssue() async throws {
        let store = try await storeWith([line("a")])
        let (model, task) = await started(
            store, catalog: StubCatalog(menus: Script(just: menu([Fixture.item("a", available: false)]))))
        await model.validate()
        #expect(filled(model)?.continueState == .blocked)
        task.cancel()
    }

    @Test("CA-CRT-07: con el negocio cerrado «Continuar» no avanza y dice que está cerrado")
    func closed() async throws {
        let store = try await storeWith([line("a")])
        // Martes a las 12:00 en Lima: el negocio abre a las 18:00.
        let catalog = StubCatalog(menus: Script(just: menu([Fixture.item("a")], schedule: Fixture.nightSchedule)))
        let (model, task) = await started(store, catalog: catalog, now: at("2026-07-07", "12:00"))
        await model.validate()
        #expect(filled(model)?.continueState == .closed)
        #expect(filled(model)?.continueState.advances == false)
        task.cancel()
    }

    @Test(
        "CUS-CAT-015: la bolsa de un negocio que pasó a modo catálogo no avanza, aunque esté abierto o cerrado (decisión de Jesús, 2026-11-27)"
    )
    func catalogOnly() async throws {
        let store = try await storeWith([line("a")])
        let items = [Fixture.category("c", [Fixture.item("a")])]
        for now in [Fixture.tuesdayEvening, at("2026-07-07", "12:00")] {
            let catalog = StubCatalog(
                menus: Script(just: Fixture.menu(items, schedule: Fixture.nightSchedule, capability: .catalogOnly)))
            let (model, task) = await started(store, catalog: catalog, now: now)
            await model.validate()
            #expect(filled(model)?.continueState == .catalogOnly)
            #expect(filled(model)?.continueState.advances == false)
            task.cancel()
        }
    }

    @Test("el mismo negocio, dentro de su horario, deja continuar")
    func openInsideTheSchedule() async throws {
        let store = try await storeWith([line("a")])
        let catalog = StubCatalog(menus: Script(just: menu([Fixture.item("a")], schedule: Fixture.nightSchedule)))
        let (model, task) = await started(store, catalog: catalog)
        await model.validate()
        #expect(filled(model)?.continueState == .ready)
        task.cancel()
    }

    @Test("CA-CRT-15: un importe roto bloquea «Continuar» aunque la carta esté revisada; la línea sigue con su «—»")
    func brokenAmount() {
        // La bolsa guardada no deja escribir un precio así: el dato roto se prueba sobre la pantalla misma.
        let huge = CartLine(
            itemId: "x", name: "Plato x", basePrice: dec("999999999999"), modifiers: [], note: nil, quantity: 50,
            imageURL: nil)
        let cart = Cart(businessId: "negocio-1", businessName: "N", lines: [huge])
        guard case let .filled(state) = CartScreenModel.state(for: cart, validation: .checked) else {
            Issue.record("debía haber platos")
            return
        }
        #expect(state.lines.first?.total == invalidAmountText)
        #expect(state.continueState == .blocked)
        #expect(state.continueState.advances == false)
    }

    @Test("la fila guarda la foto con la que se agregó el plato")
    func lineKeepsItsPhoto() async throws {
        let store = try await storeWith([line("a")])
        let (model, task) = await started(store, catalog: StubCatalog(menus: Script(just: menu([Fixture.item("a")]))))
        #expect(filled(model)?.lines.first?.imageURL == "https://example.test/a.jpg")
        task.cancel()
    }
}
