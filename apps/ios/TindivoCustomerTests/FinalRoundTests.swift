import Foundation
import Testing
import TindivoAPI

@testable import TindivoCustomer

/// La última ronda de la integración: «Editar» y «Deshacer», dinero, caché de cartas, sección elegida y avisos.
@MainActor
@Suite("Ronda final")
struct FinalRoundTests {
    private func line(_ id: String, quantity: Int = 1, price: String = "12.50") -> CartLine {
        CartLine(
            itemId: id, name: "Plato \(id)", basePrice: dec(price), modifiers: [], note: nil, quantity: quantity,
            imageURL: nil)
    }

    private func filled(_ model: CartScreenModel) -> CartScreenModel.Filled? {
        if case let .filled(filled) = model.state { filled } else { nil }
    }

    private func started(_ store: any CartStore, catalog: any CatalogRepository, voiceOver: Bool = true)
        async -> (CartScreenModel, Task<Void, Never>)
    {
        let model = CartScreenModel(
            store: store, catalog: catalog, clock: .fixed(Fixture.tuesdayEvening), voiceOverRunning: voiceOver)
        let task = Task { await model.observe() }
        await eventually { model.state != .loading }
        return (model, task)
    }

    /// Una bolsa con «a» (con opciones, se puede editar), «b» y «c».
    private func editableBag() async throws -> (FileCartStore, StubCatalog) {
        let store = temporaryStore()
        for id in ["a", "b", "c"] {
            _ = try await store.add(businessId: "negocio-1", businessName: "N", line: line(id))
        }
        let menu = Fixture.menu([
            Fixture.category(
                "c",
                [
                    Fixture.item("a", groups: [Fixture.group("g", min: 0, max: 1, options: [Fixture.option("o")])]),
                    Fixture.item("b", order: 2), Fixture.item("c", order: 3),
                ])
        ])
        return (store, StubCatalog(menus: Script(just: menu)))
    }

    // MARK: 1 y 2. «Editar» no borra el aviso de «Deshacer»

    @Test("con VoiceOver, cerrar «Editar» sin guardar no borra el aviso de «Deshacer»; solo un guardado lo cierra")
    func cancelEditingKeepsTheUndo() async throws {
        let (store, catalog) = try await editableBag()
        let (model, task) = await started(store, catalog: catalog)
        await model.validate()
        await model.remove(signature: try #require(filled(model)?.lines[1].signature))
        #expect(model.undoMessage != nil)

        await model.startEditing(signature: try #require(filled(model)?.lines[0].signature))
        #expect(model.editing != nil)
        model.cancelEditing()
        #expect(model.editing == nil)
        #expect(model.undoMessage != nil, "cerrar sin guardar no cambió la bolsa")

        await model.startEditing(signature: try #require(filled(model)?.lines[0].signature))
        model.finishEditing()
        #expect(model.undoMessage == nil, "un guardado real cambia la bolsa y cierra el aviso")
        task.cancel()
    }

    @Test(
        "abrir «Editar» hace desaparecer la bolsa, pero eso no es salir de ella: leave() no hace nada con la ficha abierta"
    )
    func leaveDoesNothingWhileEditing() async throws {
        let (store, catalog) = try await editableBag()
        let (model, task) = await started(store, catalog: catalog)
        await model.validate()
        await model.remove(signature: try #require(filled(model)?.lines[1].signature))
        await model.startEditing(signature: try #require(filled(model)?.lines[0].signature))
        model.leave()
        #expect(model.undoMessage != nil)
        model.cancelEditing()
        model.leave()
        #expect(model.undoMessage == nil, "salir de la bolsa de verdad sí cierra el aviso")
        task.cancel()
    }

    @Test("14 la carta que se bajó para «Editar» se guarda: la bolsa queda revisada sin pedirla otra vez")
    func editingKeepsTheMenu() async throws {
        let (store, catalog) = try await editableBag()
        let (model, task) = await started(store, catalog: catalog, voiceOver: false)
        #expect(filled(model)?.validation == .validating)
        await model.startEditing(signature: try #require(filled(model)?.lines[0].signature))
        #expect(filled(model)?.validation == .checked)
        #expect(catalog.menus.calls == 1)
        await model.validate()
        #expect(catalog.menus.calls == 1, "validate() reusa la carta ya guardada")
        #expect(!model.isOpeningEdit)
        task.cancel()
    }

    // MARK: 6. Dinero: un importe roto no se «arregla»

    private var hugeLine: CartLine { line("x", quantity: 50, price: "999999999999") }

    @Test("6 un subtotal que formatAmount rechaza se muestra «—» en la barra de la carta")
    func brokenSubtotalInTheCartBar() {
        let cart = Cart(businessId: "negocio-1", businessName: "N", lines: [hugeLine])
        #expect(formatAmount(cart.subtotal) == nil)
        #expect(cartBar(for: cart, businessId: "negocio-1")?.subtotal == "—")
        #expect(displayAmount(dec("12.5")).plain == "S/ 12.50")
    }

    @Test("6 en la bolsa un importe roto se muestra «—», la línea cuenta como inválida y no se puede continuar")
    func brokenAmountBlocksContinue() throws {
        // La bolsa guardada no deja escribir un precio así: el dato roto se prueba sobre la pantalla misma.
        let cart = Cart(businessId: "negocio-1", businessName: "N", lines: [line("ok"), hugeLine])
        guard case let .filled(rows) = CartScreenModel.state(for: cart, validation: .checkFailed) else {
            Issue.record("debía haber platos")
            return
        }
        #expect(rows.lines[0].total.plain == "S/ 12.50")
        #expect(rows.lines[1].total == "—")
        #expect(rows.subtotal == "—")
        // CA-CRT-15: la línea y la bolsa avisan con los textos aprobados el 2026-11-26.
        #expect(rows.lines[1].issues == ["No podemos mostrar el precio por ahora"])
        #expect(rows.amountNotice == "No podemos mostrar un precio. Intenta de nuevo en un rato.")
        #expect(!rows.amountsAreValid)
        #expect(!rows.allowsContinue)
    }

    @Test("CA-CRT-14 6 con importes válidos y la carta caída no se puede continuar")
    func validAmountsWithTheMenuDownDoNotContinue() throws {
        let cart = Cart(businessId: "negocio-1", businessName: "N", lines: [line("ok")])
        guard case let .filled(rows) = CartScreenModel.state(for: cart, validation: .checkFailed) else {
            Issue.record("debía haber platos")
            return
        }
        #expect(rows.amountsAreValid)
        #expect(!rows.allowsContinue)
    }

    // MARK: 9. Caché de cartas

    @Test("9 la caché reparte una sola petición entre dos pedidos a la vez, y la clave no distingue mayúsculas")
    func cacheDeduplicates() async throws {
        let gate = Gate()
        let menus = Script(just: Fixture.menu([Fixture.category("c", [Fixture.item("i")])]))
        let catalog = StubCatalog(menus: menus, gate: gate)
        let cache = BusinessMenuCache()
        let now = Fixture.tuesdayEvening
        async let first = cache.menu(id: "ABC-Slug", catalog: catalog, now: now)
        async let second = cache.menu(id: "abc-slug", catalog: catalog, now: now)
        // El segundo pedido ya está esperando la misma petición antes de abrir la puerta.
        for _ in 0..<10_000 where await cache.waiters(for: "abc-slug") < 2 { await Task.yield() }
        #expect(await cache.waiters(for: "abc-slug") == 2)
        gate.open()
        let results = try await (first, second)
        #expect(results.0 == results.1)
        #expect(menus.calls == 1)
        _ = try await cache.menu(id: "Abc-SLUG", catalog: catalog, now: now)
        #expect(menus.calls == 1, "una tercera con otra mayúscula sale de la caché")
    }

    @Test("9 un error no se guarda en la caché: el siguiente pedido lo vuelve a intentar")
    func cacheDoesNotKeepErrors() async throws {
        let menus = Script<BusinessMenu>([
            .failure(.network), .success(Fixture.menu([Fixture.category("c", [Fixture.item("i")])])),
        ])
        let catalog = StubCatalog(menus: menus)
        let cache = BusinessMenuCache()
        await #expect(throws: AppError.self) {
            try await cache.menu(id: "x", catalog: catalog, now: Fixture.tuesdayEvening)
        }
        _ = try await cache.menu(id: "x", catalog: catalog, now: Fixture.tuesdayEvening)
        #expect(menus.calls == 2)
    }

    // MARK: 10. Carta

    @Test("10 la sección elegida se recuerda por su id: si «Destacados» desaparece, no salta a otra")
    func selectedSectionSurvivesFeaturedLeaving() async throws {
        let menu = Fixture.menu(
            [
                Fixture.category(
                    "c1", order: 1,
                    [Fixture.item("noche", days: nil, from: "12:00", to: "20:20", image: "https://x/f.jpg")]),
                Fixture.category("c2", order: 2, [Fixture.item("b")]),
            ], featured: .init(title: "Los más pedidos", itemIds: ["noche"]))
        let manual = ManualClock(at("2026-07-07", "20:19"))
        let model = makeBusinessModel(menu, clock: manual.clock)
        await model.load()
        #expect(model.visible?.sections.map(\.id) == ["featured", "c1", "c2"])
        _ = model.jump(toSection: 2)
        #expect(model.selectedSection == 2)
        let task = Task { await model.runClock() }
        await manual.waitForSleep(number: 1)
        manual.set(at("2026-07-07", "20:21"))
        await manual.waitForSleep(number: 2)
        #expect(model.visible?.sections.map(\.id) == ["c1", "c2"])
        #expect(model.selectedSection == 1, "sigue en «c2», que ahora es la segunda")
        task.cancel()
    }
}
