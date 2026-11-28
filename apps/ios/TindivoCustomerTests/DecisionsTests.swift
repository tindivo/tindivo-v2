import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// Decisiones de Jesús del 2026-11-22: «Deshacer» con VoiceOver, «Editar» según el plato y «Destacados» con franja.
@MainActor
@Suite("Decisiones de Jesús, 2026-11-22")
struct DecisionsTests {
    private func line(_ id: String, quantity: Int = 1, modifiers: [CartModifier] = []) -> CartLine {
        CartLine(
            itemId: id, name: "Plato \(id)", basePrice: dec("12.50"), modifiers: modifiers, note: nil,
            quantity: quantity,
            imageURL: nil
        )
    }

    private func started(
        _ store: any CartStore, clock: AppClock, catalog: any CatalogRepository = UnusedCatalogRepository(),
        voiceOver: Bool
    ) async -> (CartScreenModel, Task<Void, Never>) {
        let model = CartScreenModel(store: store, catalog: catalog, clock: clock, voiceOverRunning: voiceOver)
        let task = Task { await model.observe() }
        await eventually { model.state != .loading }
        return (model, task)
    }

    private func filled(_ model: CartScreenModel) -> CartScreenModel.Filled? {
        if case let .filled(filled) = model.state { filled } else { nil }
    }

    private func twoLines() async throws -> FileCartStore {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: line("a"))
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: line("b", quantity: 2))
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: line("c"))
        return store
    }

    // MARK: 1. «Deshacer» con VoiceOver

    @Test("decisión 1: con VoiceOver el aviso «Deshacer» no se cierra solo, ni pasado el plazo")
    func undoStaysWithVoiceOver() async throws {
        let manual = ManualClock(Fixture.tuesdayEvening)
        let (model, task) = await started(try await twoLines(), clock: manual.clock, voiceOver: true)
        await model.remove(signature: try #require(filled(model)?.lines.first?.signature))
        #expect(model.undoMessage != nil)
        #expect(!model.undoAutoDismisses)
        manual.advance(by: 60)
        #expect(manual.sleeps(of: .seconds(5)) == 0, "con VoiceOver nadie se durmió esperando el plazo")
        #expect(model.undoMessage != nil, "con VoiceOver no hay plazo")
        #expect(await model.undo() == true)
        #expect(model.undoMessage == nil)
        task.cancel()
    }

    @Test("decisión 1: con VoiceOver el aviso se va al hacer otro cambio en la bolsa")
    func undoGoesOnAnotherChangeWithVoiceOver() async throws {
        let manual = ManualClock(Fixture.tuesdayEvening)
        let (model, task) = await started(try await twoLines(), clock: manual.clock, voiceOver: true)
        await model.remove(signature: try #require(filled(model)?.lines.first?.signature))
        let second = try #require(filled(model)?.lines.last?.signature)
        await model.changeQuantity(signature: second, by: 1)
        #expect(model.undoMessage == nil)
        task.cancel()
    }

    @Test("decisión 1: con VoiceOver el aviso se va al salir de la bolsa")
    func undoGoesWhenLeavingWithVoiceOver() async throws {
        let (model, task) = await started(
            try await twoLines(), clock: ManualClock(Fixture.tuesdayEvening).clock, voiceOver: true)
        await model.remove(signature: try #require(filled(model)?.lines.first?.signature))
        #expect(model.undoMessage != nil)
        model.leave()
        #expect(model.undoMessage == nil)
        task.cancel()
    }

    @Test("decisión 1: sin VoiceOver siguen los 5 s")
    func undoExpiresWithoutVoiceOver() async throws {
        let manual = ManualClock(Fixture.tuesdayEvening)
        let (model, task) = await started(try await twoLines(), clock: manual.clock, voiceOver: false)
        await model.remove(signature: try #require(filled(model)?.lines.first?.signature))
        await manual.waitForSleep(number: 1, of: .seconds(5))
        #expect(model.undoMessage != nil)
        #expect(model.undoAutoDismisses)
        manual.advance(by: 5)
        await eventually { model.undoMessage == nil }
        task.cancel()
    }

    // MARK: 2. «Editar» si el plato tiene opciones

    private func menuWithOptionalExtras() -> BusinessMenu {
        Fixture.menu([
            Fixture.category(
                "c",
                [
                    Fixture.item(
                        "combo", groups: [Fixture.group("extras", min: 0, max: 2, options: [Fixture.option("o1", "1")])]
                    ),
                    Fixture.item("simple"),
                ])
        ])
    }

    @Test("decisión 2: un plato con extras opcionales sin elegir tiene «Editar»; uno sin opciones, no")
    func editShownWhenTheDishHasOptions() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: line("combo"))
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: line("simple"))
        let catalog = StubCatalog(menus: Script(just: menuWithOptionalExtras()))
        let (model, task) = await started(
            store, clock: .fixed(Fixture.tuesdayEvening), catalog: catalog, voiceOver: false)
        #expect(filled(model)?.lines.map(\.canEdit) == [false, false], "sin carta, cae al criterio de la línea")
        await model.validate()
        await eventually { filled(model)?.validation == .checked }
        #expect(filled(model)?.lines.map(\.canEdit) == [true, false], "\(String(describing: filled(model)?.lines))")
        task.cancel()
    }

    @Test("decisión 2: si la carta falla, «Editar» sigue el criterio de la línea (tiene opciones elegidas)")
    func editFallsBackToTheLine() async throws {
        let store = temporaryStore()
        let chosen = CartModifier(optionId: "o1", groupName: "g", optionName: "o", price: 0)
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: line("combo", modifiers: [chosen]))
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: line("simple"))
        let (model, task) = await started(
            store, clock: .fixed(Fixture.tuesdayEvening), catalog: StubCatalog(), voiceOver: false
        )
        await model.validate()
        await eventually { filled(model)?.validation == .checkFailed }
        #expect(filled(model)?.lines.map(\.canEdit) == [true, false])
        task.cancel()
    }

    // MARK: 4. «Destacados» y la franja

    @Test("CA-CAT-02 decisión 4: un destacado fuera de su franja sale de «Destacados» y sigue, atenuado, en su sección")
    func featuredOutsideItsWindowLeaves() async throws {
        let photo = "https://x/f.jpg"
        let menu = Fixture.menu(
            [
                Fixture.category(
                    "c",
                    [
                        Fixture.item("noche", days: nil, from: "18:00", to: "23:00", image: photo),
                        Fixture.item("almuerzo", order: 2, days: nil, from: "12:00", to: "15:00", image: photo),
                    ])
            ],
            featured: .init(title: "Los más pedidos", itemIds: ["noche", "almuerzo"])
        )
        let model = makeBusinessModel(menu, clock: .fixed(Fixture.tuesdayEvening))
        await model.load()
        let visible = try #require(model.visible)
        #expect(visible.featured?.items.map(\.id) == ["noche"], "a las 20:00 el almuerzo no cuenta")
        let inSection = try #require(visible.categories.first?.items.first { $0.id == "almuerzo" })
        #expect(inSection.outsideWindow != nil, "en su sección sigue atenuado con el texto de su franja")
    }

    @Test("CA-CAT-02 decisión 4: si ningún destacado está en su franja, no hay sección")
    func noFeaturedWhenNoneIsInWindow() async {
        let menu = Fixture.menu(
            [
                Fixture.category(
                    "c", [Fixture.item("almuerzo", days: nil, from: "12:00", to: "15:00", image: "https://x/f.jpg")])
            ],
            featured: .init(title: "Los más pedidos", itemIds: ["almuerzo"])
        )
        let model = makeBusinessModel(menu, clock: .fixed(Fixture.tuesdayEvening))
        await model.load()
        #expect(model.visible?.featured == nil)
        #expect(model.visible?.sections.map(\.name) == ["Sección c"])
        #expect(model.rows.contains { $0.key == "carousel" } == false)
    }

    @Test("CA-CAT-02 decisión 4: se reevalúa cada minuto: a las 20:20 el destacado de «hasta las 20:20» sale solo")
    func featuredLeavesWithTheClock() async throws {
        let menu = Fixture.menu(
            [
                Fixture.category(
                    "c", [Fixture.item("noche", days: nil, from: "12:00", to: "20:20", image: "https://x/f.jpg")])
            ],
            featured: .init(title: "Los más pedidos", itemIds: ["noche"])
        )
        let manual = ManualClock(at("2026-07-07", "20:19"))
        let model = makeBusinessModel(menu, clock: manual.clock)
        await model.load()
        #expect(model.visible?.featured != nil)
        let task = Task { await model.runClock() }
        await manual.waitForSleep(number: 1)
        manual.set(at("2026-07-07", "20:20"))
        await manual.waitForSleep(number: 2)
        #expect(model.visible?.featured == nil)
        task.cancel()
    }
}
