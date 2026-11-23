import Foundation
import os
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// `CartViewModelTest.kt`.
@MainActor
@Suite("Bolsa")
struct CartScreenModelTests {
    private func line(
        _ id: String, price: String = "12.50", quantity: Int = 1, note: String? = nil, modifiers: [CartModifier] = []
    ) -> CartLine {
        CartLine(
            itemId: id, name: "Plato \(id)", basePrice: dec(price), modifiers: modifiers, note: note, quantity: quantity,
            imageURL: nil
        )
    }

    private func started(
        _ store: any CartStore, clock: AppClock = ManualClock(Fixture.tuesdayEvening).clock,
        catalog: any CatalogRepository = UnusedCatalogRepository()
    ) async -> (CartScreenModel, Task<Void, Never>) {
        let model = CartScreenModel(store: store, catalog: catalog, clock: clock)
        let task = Task { await model.observe() }
        await eventually { model.state != .loading }
        return (model, task)
    }

    private func filled(_ model: CartScreenModel) -> CartScreenModel.Filled? {
        if case let .filled(filled) = model.state { filled } else { nil }
    }

    @Test("hasta que se lee lo guardado no se enseña «vacía»")
    func startsLoading() {
        let model = CartScreenModel(store: temporaryStore(), catalog: UnusedCatalogRepository(), clock: ManualClock(Fixture.tuesdayEvening).clock)
        #expect(model.state == .loading)
    }

    @Test("sin bolsa la pantalla está vacía")
    func empty() async {
        let (model, task) = await started(temporaryStore())
        #expect(model.state == .empty)
        task.cancel()
    }

    @Test("cada línea muestra sus opciones, su nota y su total exacto")
    func lineText() async throws {
        let store = temporaryStore()
        let modifier = CartModifier(optionId: "o1", groupName: "Tamaño", optionName: "1/4", price: dec("2.50"))
        _ = try await store.add(
            businessId: "n1", businessName: "Don Lucho", line: line("a", price: "10", quantity: 3, note: "sin ají", modifiers: [modifier])
        )
        let (model, task) = await started(store)
        let state = try #require(filled(model))
        #expect(state.businessId == "n1")
        #expect(state.businessName == "Don Lucho")
        let row = try #require(state.lines.first)
        #expect(row.name == "Plato a")
        #expect(row.options == [CartOptionText(id: "o1", group: "Tamaño", option: "1/4")])
        #expect(row.note == "sin ají")
        #expect(row.quantity == 3)
        #expect(row.total.plain == "S/ 37.50")
        #expect(state.subtotal.plain == "S/ 37.50")
        task.cancel()
    }

    @Test("dos grupos con una opción del mismo nombre no comparten identidad en la lista")
    func sameOptionNameInTwoGroups() async throws {
        let store = temporaryStore()
        let modifiers = [
            CartModifier(optionId: "o1", groupName: "Presa", optionName: "Mediano", price: dec("0")),
            CartModifier(optionId: "o2", groupName: "Papas", optionName: "Mediano", price: dec("0")),
        ]
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a", modifiers: modifiers))
        let (model, task) = await started(store)
        let options = try #require(filled(model)).lines[0].options
        #expect(options.count == 2)
        #expect(Set(options.map(\.id)).count == 2)
        task.cancel()
    }

    @Test("CA-CRT-03: con 1 unidad el − quita la línea y con 50 el + está apagado")
    func quantityButtons() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("uno"))
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("tope", quantity: 50))
        let (model, task) = await started(store)
        let rows = try #require(filled(model)).lines
        #expect(rows[0].decreaseRemoves == true)
        #expect(rows[0].canIncrease == true)
        #expect(rows[1].decreaseRemoves == false)
        #expect(rows[1].canIncrease == false)
        task.cancel()
    }

    @Test("sumar y restar unidades cambia la línea")
    func changeQuantity() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a", quantity: 2))
        let (model, task) = await started(store)
        let signature = try #require(filled(model)?.lines.first?.signature)

        await model.changeQuantity(signature: signature, by: 1)
        #expect(await store.current()?.lines.first?.quantity == 3)
        await eventually { filled(model)?.lines.first?.quantity == 3 }
        await model.changeQuantity(signature: signature, by: -1)
        await model.changeQuantity(signature: signature, by: -1)
        #expect(await store.current()?.lines.first?.quantity == 1)
        await eventually { filled(model)?.lines.first?.quantity == 1 }
        task.cancel()
    }

    @Test("CA-CRT-03: con cantidad 1, restar quita la línea; si era la última, la bolsa queda vacía sin negocio")
    func decreaseAtOneRemovesTheLine() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a"))
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("b", quantity: 2))
        let (model, task) = await started(store)
        let a = try #require(filled(model)?.lines.first?.signature)
        await model.changeQuantity(signature: a, by: -1)
        #expect(await store.current()?.lines.map(\.itemId) == ["b"])
        await eventually { filled(model)?.lines.map(\.name) == ["Plato b"] }

        let b = try #require(filled(model)?.lines.first?.signature)
        await model.changeQuantity(signature: b, by: -1)
        #expect(await store.current()?.lines.first?.quantity == 1)
        await eventually { filled(model)?.lines.first?.quantity == 1 }
        await model.changeQuantity(signature: b, by: -1)
        #expect(await store.current() == nil)
        await eventually { model.state == .empty }
        task.cancel()
    }

    @Test("dos toques seguidos al + no pierden ninguna unidad")
    func concurrentIncrementsAreNotLost() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a"))
        let (model, task) = await started(store)
        let signature = try #require(filled(model)?.lines.first?.signature)
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<20 { group.addTask { await model.changeQuantity(signature: signature, by: 1) } }
        }
        #expect(await store.current()?.lines.first?.quantity == 21)
        task.cancel()
    }

    @Test("cambiar la cantidad de una línea que ya no está no hace nada")
    func changeUnknownLine() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a"))
        let (model, task) = await started(store)
        await model.changeQuantity(signature: "no-existe", by: 1)
        #expect(await store.current()?.lines.first?.quantity == 1)
        task.cancel()
    }

    @Test("quitar una línea deja las demás y quitar la última deja la bolsa vacía")
    func removeLine() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a"))
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("b"))
        let (model, task) = await started(store)
        let first = try #require(filled(model)?.lines.first?.signature)
        await model.remove(signature: first)
        await eventually { filled(model)?.lines.map(\.name) == ["Plato b"] }
        let last = try #require(filled(model)?.lines.first?.signature)
        await model.remove(signature: last)
        await eventually { model.state == .empty }
        task.cancel()
    }

    @Test("vaciar deja la bolsa vacía")
    func clear() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a"))
        let (model, task) = await started(store)
        await model.clear()
        await eventually { model.state == .empty }
        #expect(await store.current() == nil)
        task.cancel()
    }

    @Test("lo que cambia desde fuera (la carta agrega un plato) llega a la pantalla")
    func followsOutsideChanges() async throws {
        let store = temporaryStore()
        let (model, task) = await started(store)
        #expect(model.state == .empty)
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a"))
        await eventually { filled(model)?.lines.count == 1 }
        task.cancel()
    }

}

extension CartScreenModelTests {
    // MARK: Deshacer (CA-CRT-10)

    @Test("CA-CRT-10: quitar la segunda de tres líneas y tocar «Deshacer» antes de 5 s la devuelve a su sitio con su cantidad")
    func undoRestoresTheLineInPlace() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a", price: "10"))
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("b", price: "20", quantity: 3))
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("c", price: "5"))
        let (model, task) = await started(store)
        let before = try #require(filled(model)).subtotal
        let second = try #require(filled(model)?.lines[1].signature)

        await model.remove(signature: second)
        #expect(model.undoMessage == "Quitaste \"Plato b\"")
        await eventually { filled(model)?.lines.map(\.name) == ["Plato a", "Plato c"] }
        #expect(try #require(filled(model)).subtotal != before)

        #expect(await model.undo() == true)
        #expect(await store.current()?.lines.map(\.itemId) == ["a", "b", "c"])
        #expect(await store.current()?.lines[1].quantity == 3)
        await eventually { filled(model)?.lines.map(\.name) == ["Plato a", "Plato b", "Plato c"] }
        #expect(filled(model)?.subtotal == before)
        #expect(model.undoMessage == nil)
        task.cancel()
    }

    @Test("CA-CRT-10: pasados 5 s «Deshacer» ya no devuelve la línea")
    func undoExpiresAfterFiveSeconds() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a"))
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("b"))
        let sleeps = OSAllocatedUnfairLock<[Duration]>(initialState: [])
        let manual = ManualClock(Fixture.tuesdayEvening)
        let base = manual.clock
        let clock = AppClock(now: base.now, sleep: { duration in
            sleeps.withLock { $0.append(duration) }
            try await base.sleep(duration)
        })
        let (model, task) = await started(store, clock: clock)
        await model.remove(signature: try #require(filled(model)?.lines.first?.signature))
        await eventually { sleeps.withLock { $0 } == [.seconds(5)] }
        #expect(model.undoMessage != nil)

        manual.advance(by: 5)
        await eventually { model.undoMessage == nil }
        #expect(await model.undo() == false)
        #expect(await store.current()?.lines.map(\.itemId) == ["b"])
        task.cancel()
    }

    @Test("CUS-CRT-003: quitar la última línea deja la bolsa vacía y sin aviso de «Deshacer»")
    func removingTheLastLineHasNoUndo() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a"))
        let (model, task) = await started(store)
        await model.remove(signature: try #require(filled(model)?.lines.first?.signature))
        #expect(model.undoMessage == nil)
        #expect(await model.undo() == false)
        #expect(await store.current() == nil)
        await eventually { model.state == .empty }
        task.cancel()
    }

    @Test("un segundo «Quitaste» reemplaza al primero: solo se deshace la última")
    func undoOnlyTheLastRemoval() async throws {
        let store = temporaryStore()
        for id in ["a", "b", "c"] { _ = try await store.add(businessId: "n1", businessName: "N", line: line(id)) }
        let (model, task) = await started(store)
        await model.remove(signature: line("a").signature)
        await model.remove(signature: line("b").signature)
        #expect(model.undoMessage == "Quitaste \"Plato b\"")
        #expect(await model.undo() == true)
        #expect(await store.current()?.lines.map(\.itemId) == ["b", "c"])
        task.cancel()
    }

    // MARK: Método de entrega (CA-CRT-01, CA-CRT-08)

    @Test("CA-CRT-01: la bolsa muestra «Delivery» y la fila del envío por defecto")
    func deliveryByDefault() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a"))
        let (model, task) = await started(store)
        let state = try #require(filled(model))
        #expect(state.method == .delivery)
        #expect(state.methodLabel == "Delivery")
        #expect(state.showsShipping)
        task.cancel()
    }

    @Test("CA-CRT-08: una bolsa de recojo dice «Recojo» y no muestra la fila del envío")
    func pickupLabel() async throws {
        let cart = Cart(businessId: "n1", businessName: "N", lines: [line("a")], method: .pickup)
        let state = try #require({ () -> CartScreenModel.Filled? in
            if case let .filled(filled) = CartScreenModel.state(for: cart) { filled } else { nil }
        }())
        #expect(state.methodLabel == "Recojo")
        #expect(state.showsShipping == false)
    }

    // MARK: VoiceOver

    @Test("VoiceOver: el contador dice «2 unidades» y «1 unidad», y los botones dicen qué hacen")
    func accessibilityLabels() throws {
        let cart = Cart(businessId: "n1", businessName: "N", lines: [line("a", quantity: 1), line("b", quantity: 2)])
        guard case let .filled(filled) = CartScreenModel.state(for: cart) else { Issue.record("debía haber platos"); return }
        #expect(filled.countLabel == "3 productos")
        #expect(filled.lines[0].decreaseLabel == "Quitar Plato a")
        #expect(filled.lines[1].decreaseLabel == "Quitar una unidad de Plato b. Llevas 2 unidades")
        #expect(filled.lines[1].increaseLabel == "Agregar una unidad de Plato b. Llevas 2 unidades")
    }

}

extension CartScreenModelTests {
    // MARK: Validación contra la carta (CA-CRT-05)

    private func validationMenu(_ items: [BusinessMenu.Item]) -> BusinessMenu {
        Fixture.menu([Fixture.category("c", items)])
    }

    private func validated(
        lines: [CartLine], menu: BusinessMenu
    ) async throws -> (CartScreenModel, FileCartStore, Task<Void, Never>) {
        let store = temporaryStore()
        for line in lines { _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: line) }
        let (model, task) = await started(store, catalog: StubCatalog(menus: Script(just: menu)))
        await model.validate()
        return (model, store, task)
    }

    @Test("CA-CRT-05 parcial (aviso en la línea y canContinue; «Continuar» llega con el checkout): antes de que responda la carta la bolsa se ve, está «validando» y no se puede continuar")
    func validatingBeforeTheMenuAnswers() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: line("a"))
        let gate = Gate()
        let catalog = StubCatalog(menus: Script(just: validationMenu([Fixture.item("a")])), gate: gate)
        let (model, task) = await started(store, catalog: catalog)
        #expect(filled(model)?.validation == .validating)
        #expect(model.canContinue == false)

        let validation = Task { await model.validate() }
        await eventually { catalog.menus.calls == 1 }
        #expect(filled(model)?.lines.count == 1)
        #expect(filled(model)?.validation == .validating)
        #expect(model.canContinue == false)

        gate.open()
        await validation.value
        #expect(filled(model)?.validation == .checked)
        #expect(model.canContinue == true)
        task.cancel()
    }

    @Test("CA-CRT-05 parcial (aviso en la línea y canContinue; «Continuar» llega con el checkout): un plato agotado se avisa en su línea y no se puede continuar hasta quitarlo")
    func unavailableLineBlocksContinuing() async throws {
        let (model, _, task) = try await validated(
            lines: [line("a"), line("b")],
            menu: validationMenu([Fixture.item("a", order: 1), Fixture.item("b", order: 2, available: false)])
        )
        let rows = try #require(filled(model)).lines
        #expect(rows[0].issues.isEmpty)
        #expect(rows[1].issues == ["Producto agotado por ahora"])
        #expect(model.canContinue == false)

        await model.remove(signature: rows[1].signature)
        await eventually { filled(model)?.lines.map(\.name) == ["Plato a"] }
        #expect(filled(model)?.validation == .checked)
        #expect(model.canContinue == true)
        task.cancel()
    }

    @Test("CA-CRT-05 parcial (aviso en la línea y canContinue; «Continuar» llega con el checkout): un precio cambiado se avisa en la línea y bloquea; la bolsa no se toca")
    func changedPriceBlocksContinuing() async throws {
        let (model, store, task) = try await validated(
            lines: [line("a", price: "10")], menu: validationMenu([Fixture.item("a", price: "12")])
        )
        #expect(filled(model)?.lines.first?.issues.map(\.plain) == ["Precio actualizado (+S/ 2.00)"])
        #expect(model.canContinue == false)
        #expect(await store.current()?.lines.first?.basePrice == dec("10"))
        task.cancel()
    }

    @Test("CA-CRT-05 parcial (aviso en la línea y canContinue; «Continuar» llega con el checkout): un plato eliminado, uno fuera de franja y una opción que ya no existe se avisan en su línea")
    func otherIssuesAreShownOnTheLine() async throws {
        let sizes = Fixture.group("g", single: true, required: true, options: [Fixture.option("a", "1")])
        let stale = CartModifier(optionId: "zz", groupName: "Grupo g", optionName: "Opción zz", price: dec("1"))
        let (model, _, task) = try await validated(
            lines: [line("gone"), line("noon"), line("opt", modifiers: [stale])],
            menu: validationMenu([
                Fixture.item("noon", order: 1, from: "11:00", to: "15:00"),
                Fixture.item("opt", order: 2, groups: [sizes]),
            ])
        )
        let rows = try #require(filled(model)).lines
        #expect(rows[0].issues == ["Este producto ya no está disponible"])
        #expect(rows[1].issues == ["Solo de 11:00 a 15:00"])
        #expect(rows[2].issues == ["Una opción ya no está disponible"])
        #expect(model.canContinue == false)
        task.cancel()
    }

    @Test("CA-CRT-05 parcial (aviso en la línea y canContinue; «Continuar» llega con el checkout): una bolsa que coincide con la carta puede continuar")
    func matchingBagCanContinue() async throws {
        let (model, _, task) = try await validated(lines: [line("a")], menu: validationMenu([Fixture.item("a")]))
        #expect(filled(model)?.validation == .checked)
        #expect(model.canContinue == true)
        task.cancel()
    }

    @Test("CA-CRT-05 parcial (aviso en la línea y canContinue; «Continuar» llega con el checkout): si la carta no se puede leer no se bloquea: queda «sin validar» y sin avisos")
    func uncheckedWhenTheMenuFails() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: line("a"))
        let (model, task) = await started(store, catalog: StubCatalog(menus: Script(failing: .network)))
        await model.validate()
        #expect(filled(model)?.validation == .unchecked)
        #expect(filled(model)?.lines.first?.issues.isEmpty == true)
        #expect(model.canContinue == true)
        task.cancel()
    }

    @Test("CA-CRT-05 parcial (aviso en la línea y canContinue; «Continuar» llega con el checkout): una carta que no se puede mostrar tal cual (precio con tres decimales) también queda «sin validar»")
    func uncheckedWhenTheMenuIsInvalid() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: line("a"))
        let broken = validationMenu([Fixture.item("a", price: "10.123")])
        let (model, task) = await started(store, catalog: StubCatalog(menus: Script(just: broken)))
        await model.validate()
        #expect(filled(model)?.validation == .unchecked)
        #expect(model.canContinue == true)
        task.cancel()
    }

    @Test("una bolsa vacía no tiene nada que continuar")
    func emptyBagCannotContinue() async {
        let (model, task) = await started(temporaryStore())
        await model.validate()
        #expect(model.canContinue == false)
        task.cancel()
    }

}

extension CartScreenModelTests {
    // MARK: Editar (CA-CRT-11)

    private func editableMenu(available: Bool = true) -> BusinessMenu {
        let group = Fixture.group("g", single: true, required: true, options: [Fixture.option("a", "1"), Fixture.option("b", "2")])
        return Fixture.menu([Fixture.category("c", [Fixture.item("i1", price: "10", available: available, groups: [group])])])
    }

    private func editableLine() -> CartLine {
        CartLine(
            itemId: "i1", name: "Plato i1", basePrice: dec("10"),
            modifiers: [CartModifier(optionId: "a", groupName: "Grupo g", optionName: "Opción a", price: dec("1"))],
            note: "sin ají", quantity: 2, imageURL: nil
        )
    }

    @Test("CA-CRT-11: «Editar» solo existe en una línea con opciones")
    func editOnlyWithOptions() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: line("plain"))
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: editableLine())
        let (model, task) = await started(store)
        #expect(try #require(filled(model)).lines.map(\.canEdit) == [false, true])
        task.cancel()
    }

    @Test("CA-CRT-11: «Editar» abre el plato de la carta vigente con lo elegido en la línea")
    func startEditingOpensTheDish() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: editableLine())
        let (model, task) = await started(store, catalog: StubCatalog(menus: Script(just: editableMenu())))
        await model.startEditing(signature: editableLine().signature)
        let target = try #require(model.editing)
        #expect(target.item.id == "i1")
        #expect(target.line == editableLine())
        let dish = model.dishModel(for: target)
        #expect(dish.isEditing)
        #expect(dish.selection.selectedIds == ["a"])
        #expect(dish.selection.note == "sin ají")
        #expect(dish.selection.quantity == 2)
        model.finishEditing()
        #expect(model.editing == nil)
        task.cancel()
    }

    @Test("CA-CRT-11: si el plato ya no se puede pedir, «Editar» avisa y no abre nada")
    func startEditingOfAnUnavailableDish() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: editableLine())
        let (model, task) = await started(store, catalog: StubCatalog(menus: Script(just: editableMenu(available: false))))
        await model.startEditing(signature: editableLine().signature)
        #expect(model.editing == nil)
        #expect(model.notices.message == "Este producto ya no está disponible")
        task.cancel()
    }

    @Test("CA-CRT-11: si no se puede leer la carta, «Editar» avisa del error y no abre nada")
    func startEditingWithoutNetwork() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: editableLine())
        let (model, task) = await started(store, catalog: StubCatalog(menus: Script(failing: .network)))
        await model.startEditing(signature: editableLine().signature)
        #expect(model.editing == nil)
        #expect(model.notices.message == ErrorText.message(for: .network))
        task.cancel()
    }

    // MARK: Deshacer: casos límite

    @Test("dos «Quitar» seguidos de la misma línea no tocan el «Deshacer» de la primera")
    func doubleRemoveKeepsTheUndo() async throws {
        let store = temporaryStore()
        for id in ["a", "b", "c"] { _ = try await store.add(businessId: "n1", businessName: "N", line: line(id)) }
        let (model, task) = await started(store)
        await model.remove(signature: line("b").signature)
        let first = model.undoOffer
        #expect(first?.message == "Quitaste \"Plato b\"")
        await model.remove(signature: line("b").signature)
        #expect(model.undoOffer == first)
        #expect(await model.undo() == true)
        #expect(await store.current()?.lines.map(\.itemId) == ["a", "b", "c"])
        task.cancel()
    }

    @Test("«Deshacer» con una línea igual ya en la bolsa suma las cantidades")
    func undoMergesWithAnIdenticalLine() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a"))
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("b", quantity: 2))
        let (model, task) = await started(store)
        await model.remove(signature: line("b").signature)
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("b", quantity: 3))
        #expect(await model.undo() == true)
        #expect(await store.current()?.lines.map(\.quantity) == [1, 5])
        task.cancel()
    }

    @Test("«Deshacer» con 50 platos distintos avisa y la bolsa no cambia")
    func undoWhenTheBagIsFull() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("a"))
        _ = try await store.add(businessId: "n1", businessName: "N", line: line("b"))
        let (model, task) = await started(store)
        await model.remove(signature: line("b").signature)
        for i in 0..<(CartLimits.maxLines - 1) { _ = try await store.add(businessId: "n1", businessName: "N", line: line("p\(i)")) }
        #expect(await store.current()?.lines.count == CartLimits.maxLines)
        #expect(await model.undo() == false)
        #expect(model.notices.message == "Tu bolsa ya tiene 50 platos distintos: es el máximo por pedido")
        #expect(await store.current()?.lines.count == CartLimits.maxLines)
        task.cancel()
    }

    @Test("si «Deshacer» no se puede guardar, avisa y sigue ofreciéndolo")
    func undoThatFailsToSaveIsOfferedAgain() async throws {
        let inner = temporaryStore()
        _ = try await inner.add(businessId: "n1", businessName: "N", line: line("a"))
        _ = try await inner.add(businessId: "n1", businessName: "N", line: line("b"))
        let store = RestoreFailingStore(inner: inner)
        let (model, task) = await started(store)
        await model.remove(signature: line("b").signature)
        #expect(await model.undo() == false)
        #expect(model.notices.message == "No se pudo guardar tu bolsa. Inténtalo de nuevo.")
        #expect(model.undoMessage != nil)
        await store.allowRestore()
        #expect(await model.undo() == true)
        #expect(await inner.current()?.lines.map(\.itemId) == ["a", "b"])
        task.cancel()
    }

}

extension CartScreenModelTests {
    // MARK: Validación: casos límite

    @Test("un .cancelled que no viene de cerrar la pantalla es un fallo: «sin validar», sin bloquear")
    func strayCancelledIsAFailure() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: line("a"))
        let (model, task) = await started(store, catalog: StubCatalog(menus: Script(failing: .cancelled)))
        await model.validate()
        #expect(filled(model)?.validation == .unchecked)
        #expect(model.canContinue == true)
        task.cancel()
    }

    @Test("con la carta ya cargada del mismo negocio no se vuelve a pedir")
    func menuIsNotRequestedTwice() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: line("a"))
        let catalog = StubCatalog(menus: Script(just: validationMenu([Fixture.item("a")])))
        let (model, task) = await started(store, catalog: catalog)
        await model.validate()
        await model.validate()
        #expect(catalog.menus.calls == 1)
        task.cancel()
    }

    @Test("con la pantalla abierta, un plato que sale de su franja se avisa al pasar el minuto")
    func windowIsRecomputedEveryMinute() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: line("a"))
        let manual = ManualClock(at("2026-07-07", "22:59"))
        let menu = validationMenu([Fixture.item("a", from: "18:00", to: "23:00")])
        let (model, task) = await started(store, clock: manual.clock, catalog: StubCatalog(menus: Script(just: menu)))
        await model.validate()
        #expect(filled(model)?.lines.first?.issues.isEmpty == true)
        let ticking = Task { await model.runClock() }
        manual.advance(by: 120)
        await eventually { filled(model)?.lines.first?.issues.isEmpty == false }
        #expect(model.canContinue == false)
        ticking.cancel()
        task.cancel()
    }

    @Test("dos toques rápidos a «Editar» piden la carta una sola vez")
    func doubleTapOnEditOpensOnce() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "N", line: editableLine())
        let gate = Gate()
        let catalog = StubCatalog(menus: Script(just: editableMenu()), gate: gate)
        let (model, task) = await started(store, catalog: catalog)
        let signature = editableLine().signature
        let first = Task { await model.startEditing(signature: signature) }
        await eventually { catalog.menus.calls == 1 }
        await model.startEditing(signature: signature)
        gate.open()
        await first.value
        #expect(catalog.menus.calls == 1)
        #expect(model.editing != nil)
        task.cancel()
    }

    // MARK: Si no se puede guardar

    @Test("si falla guardar, se avisa «No se pudo guardar tu bolsa» y la bolsa se queda como estaba")
    func saveFailureShowsTheNotice() async throws {
        let store = FailingStore(cart: Cart(businessId: "n1", businessName: "N", lines: [line("a", quantity: 2)]))
        let (model, task) = await started(store)
        let signature = try #require(filled(model)?.lines.first?.signature)

        await model.changeQuantity(signature: signature, by: 1)
        #expect(model.notices.message == "No se pudo guardar tu bolsa. Inténtalo de nuevo.")
        model.notices.clear()
        await model.remove(signature: signature)
        #expect(model.notices.message == "No se pudo guardar tu bolsa. Inténtalo de nuevo.")
        #expect(model.undoMessage == nil)
        model.notices.clear()
        await model.clear()
        #expect(model.notices.message == "No se pudo guardar tu bolsa. Inténtalo de nuevo.")
        #expect(filled(model)?.lines.first?.quantity == 2)
        task.cancel()
    }
}

/// Una bolsa cuyo disco no deja escribir: toda escritura lanza `saveFailed`.
private actor FailingStore: CartStore {
    private let cart: Cart

    init(cart: Cart) { self.cart = cart }

    func current() -> Cart? { cart }
    func updates() -> AsyncStream<Cart?> {
        let (stream, continuation) = AsyncStream.makeStream(of: Cart?.self)
        continuation.yield(cart)
        return stream
    }

    func add(businessId: String, businessName: String, line: CartLine) throws(CartError) -> AddResult { throw .saveFailed }
    func replace(businessId: String, businessName: String, line: CartLine) throws(CartError) { throw .saveFailed }
    func changeQuantity(signature: String, by delta: Int) throws(CartError) { throw .saveFailed }
    func remove(signature: String) throws(CartError) -> RemovedLine? { throw .saveFailed }
    func restore(_ removed: RemovedLine) throws(CartError) -> RestoreResult { throw .saveFailed }
    func replaceLine(signature: String, with line: CartLine) throws(CartError) -> LineEditResult { throw .saveFailed }
    func clear() throws(CartError) { throw .saveFailed }
}

/// Una bolsa real cuyo `restore` falla hasta que la prueba lo permite.
private actor RestoreFailingStore: CartStore {
    private let inner: FileCartStore
    private var failing = true

    init(inner: FileCartStore) { self.inner = inner }

    func allowRestore() { failing = false }

    func current() async -> Cart? { await inner.current() }
    func updates() async -> AsyncStream<Cart?> { await inner.updates() }
    func add(businessId: String, businessName: String, line: CartLine) async throws(CartError) -> AddResult {
        try await inner.add(businessId: businessId, businessName: businessName, line: line)
    }
    func replace(businessId: String, businessName: String, line: CartLine) async throws(CartError) {
        try await inner.replace(businessId: businessId, businessName: businessName, line: line)
    }
    func changeQuantity(signature: String, by delta: Int) async throws(CartError) {
        try await inner.changeQuantity(signature: signature, by: delta)
    }
    func replaceLine(signature: String, with line: CartLine) async throws(CartError) -> LineEditResult {
        try await inner.replaceLine(signature: signature, with: line)
    }
    func remove(signature: String) async throws(CartError) -> RemovedLine? { try await inner.remove(signature: signature) }
    func restore(_ removed: RemovedLine) async throws(CartError) -> RestoreResult {
        if failing { throw .saveFailed }
        return try await inner.restore(removed)
    }
    func clear() async throws(CartError) { try await inner.clear() }
}
