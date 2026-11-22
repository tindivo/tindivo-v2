import Foundation
import Testing
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

    private func started(_ store: FileCartStore) async -> (CartScreenModel, Task<Void, Never>) {
        let model = CartScreenModel(store: store)
        let task = Task { await model.observe() }
        await eventually { model.state != .loading }
        return (model, task)
    }

    private func filled(_ model: CartScreenModel) -> CartScreenModel.Filled? {
        if case let .filled(filled) = model.state { filled } else { nil }
    }

    @Test("hasta que se lee lo guardado no se enseña «vacía»")
    func startsLoading() {
        let model = CartScreenModel(store: temporaryStore())
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
