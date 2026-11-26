import Foundation
import os
import Testing
import TindivoAPI

@testable import TindivoCustomer

/// La bolsa: una carta que ya cargó «Editar» no se pierde por un fallo de red tardío, y «Deshacer» sigue a VoiceOver
/// cuando se enciende o se apaga con el aviso abierto.
@MainActor
@Suite("Bolsa: carta y «Deshacer»")
struct CartUndoAndMenuTests {
    /// La primera carta espera la puerta y falla; las siguientes salen bien al instante.
    private final class FirstMenuFails: CatalogRepository, Sendable {
        let gate = Gate()
        let menu: BusinessMenu
        private let calls = OSAllocatedUnfairLock(initialState: 0)

        init(menu: BusinessMenu) { self.menu = menu }

        var menuCalls: Int { calls.withLock { $0 } }

        func listBusinesses() async throws(AppError) -> [BusinessSummary] { [] }

        func getBusiness(id: String) async throws(AppError) -> BusinessMenu {
            let number = calls.withLock { state -> Int in
                state += 1
                return state
            }
            guard number == 1 else { return menu }
            await gate.wait()
            throw .network
        }
    }

    private func line(_ id: String) -> CartLine {
        CartLine(
            itemId: id, name: "Plato \(id)", basePrice: dec("12.50"), modifiers: [], note: nil, quantity: 1,
            imageURL: nil)
    }

    private func filled(_ model: CartScreenModel) -> CartScreenModel.Filled? {
        if case let .filled(filled) = model.state { filled } else { nil }
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

    private func twoLines() async throws -> FileCartStore {
        let store = temporaryStore()
        for id in ["a", "b"] { _ = try await store.add(businessId: "negocio-1", businessName: "N", line: line(id)) }
        return store
    }

    @Test("D1 si validate() falla por red pero «Editar» ya cargó la carta de ese negocio, no baja a «sin validar»")
    func lateNetworkFailureKeepsTheLoadedMenu() async throws {
        let store = try await twoLines()
        let menu = Fixture.menu([
            Fixture.category(
                "c",
                [
                    Fixture.item("a", groups: [Fixture.group("g", min: 0, max: 1, options: [Fixture.option("o")])]),
                    Fixture.item("b", order: 2),
                ])
        ])
        let catalog = FirstMenuFails(menu: menu)
        let (model, task) = await started(
            store, clock: ManualClock(Fixture.tuesdayEvening).clock, catalog: catalog, voiceOver: false)
        let validating = Task { await model.validate() }
        await eventually { catalog.menuCalls == 1 }
        await model.startEditing(signature: try #require(filled(model)?.lines[0].signature))
        #expect(filled(model)?.validation == .checked, "«Editar» dejó la carta cargada")
        catalog.gate.open()
        await validating.value
        #expect(catalog.menuCalls == 2)
        #expect(filled(model)?.validation == .checked, "el fallo tardío de la primera petición no la tumba")
        task.cancel()
    }

    @Test("D1 sin otra carta cargada, un fallo de red deja la bolsa en «carta caída»")
    func networkFailureStillUnchecked() async throws {
        let store = try await twoLines()
        let catalog = FirstMenuFails(menu: Fixture.menu([]))
        let (model, task) = await started(
            store, clock: ManualClock(Fixture.tuesdayEvening).clock, catalog: catalog, voiceOver: false)
        let validating = Task { await model.validate() }
        await eventually { catalog.menuCalls == 1 }
        catalog.gate.open()
        await validating.value
        #expect(filled(model)?.validation == .checkFailed)
        task.cancel()
    }

    @Test("D2 si VoiceOver se apaga con el aviso abierto, arranca el plazo de 5 s")
    func turningVoiceOverOffStartsTheDeadline() async throws {
        let manual = ManualClock(Fixture.tuesdayEvening)
        let (model, task) = await started(try await twoLines(), clock: manual.clock, voiceOver: true)
        await model.remove(signature: try #require(filled(model)?.lines.first?.signature))
        #expect(!model.undoAutoDismisses)
        #expect(manual.sleeps(of: .seconds(5)) == 0)
        model.setVoiceOver(false)
        #expect(model.undoAutoDismisses)
        await manual.waitForSleep(number: 1, of: .seconds(5))
        #expect(model.undoMessage != nil)
        manual.advance(by: 5)
        await eventually { model.undoMessage == nil }
        task.cancel()
    }

    @Test("D2 leave() decide por cómo se abrió el aviso: abierto con plazo, sigue aunque VoiceOver se encienda después")
    func leaveFollowsHowTheOfferWasOpened() async throws {
        let manual = ManualClock(Fixture.tuesdayEvening)
        let (model, task) = await started(try await twoLines(), clock: manual.clock, voiceOver: false)
        await model.remove(signature: try #require(filled(model)?.lines.first?.signature))
        model.setVoiceOver(true)
        model.leave()
        #expect(model.undoMessage != nil, "el aviso tiene su plazo: salir no lo cierra")
        task.cancel()
    }

    @Test("D2 si VoiceOver se apaga, el aviso pasa a tener plazo y salir de la bolsa no lo cierra")
    func leaveAfterVoiceOverTurnedOff() async throws {
        let manual = ManualClock(Fixture.tuesdayEvening)
        let (model, task) = await started(try await twoLines(), clock: manual.clock, voiceOver: true)
        await model.remove(signature: try #require(filled(model)?.lines.first?.signature))
        model.setVoiceOver(false)
        model.leave()
        #expect(model.undoMessage != nil, "al apagarse VoiceOver el aviso pasó a tener plazo")
        task.cancel()
    }
}
