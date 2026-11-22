import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// Una bolsa que deja pasar `add` solo cuando la prueba abre la puerta, para ver qué pasa con un segundo toque.
private actor GatedStore: CartStore {
    private let inner: FileCartStore
    private let gate: Gate
    private(set) var addCalls = 0

    init(inner: FileCartStore, gate: Gate) {
        self.inner = inner
        self.gate = gate
    }

    func current() async -> Cart? { await inner.current() }
    func updates() async -> AsyncStream<Cart?> { await inner.updates() }

    func add(businessId: String, businessName: String, line: CartLine) async throws(CartError) -> AddResult {
        addCalls += 1
        await gate.wait()
        return try await inner.add(businessId: businessId, businessName: businessName, line: line)
    }

    func replace(businessId: String, businessName: String, line: CartLine) async throws(CartError) {
        try await inner.replace(businessId: businessId, businessName: businessName, line: line)
    }

    func setQuantity(signature: String, quantity: Int) async throws(CartError) {
        try await inner.setQuantity(signature: signature, quantity: quantity)
    }

    func changeQuantity(signature: String, by delta: Int) async throws(CartError) {
        try await inner.changeQuantity(signature: signature, by: delta)
    }

    func replaceLine(signature: String, with line: CartLine) async throws(CartError) -> LineEditResult {
        try await inner.replaceLine(signature: signature, with: line)
    }

    func remove(signature: String) async throws(CartError) -> RemovedLine? { try await inner.remove(signature: signature) }
    func restore(_ removed: RemovedLine) async throws(CartError) -> Bool { try await inner.restore(removed) }
    func clear() async throws(CartError) { try await inner.clear() }
}

func temporaryStore() -> FileCartStore {
    FileCartStore(fileURL: FileManager.default.temporaryDirectory.appending(path: "tindivo-test-\(UUID().uuidString)/cart.json"))
}

/// Un archivo que ya existe donde la bolsa quiere un directorio: guardar falla siempre.
private func unwritableStore() throws -> FileCartStore {
    let blocker = FileManager.default.temporaryDirectory.appending(path: "tindivo-block-\(UUID().uuidString)")
    try Data().write(to: blocker)
    return FileCartStore(fileURL: blocker.appending(path: "cart.json"))
}

@MainActor
@Suite("Plato")
struct DishScreenModelTests {
    private func menuItem(_ raw: BusinessMenu.Item) throws -> MenuItem {
        let detail = try #require(MenuMapping.detail(from: Fixture.menu([Fixture.category("c", [raw])])))
        return try #require(detail.categories.first?.items.first)
    }

    private func model(
        _ raw: BusinessMenu.Item = Fixture.item("i1"), store: any CartStore, business: String = "negocio-1",
        name: String = "Don Lucho", clock: AppClock = .fixed(Fixture.tuesdayEvening), editing: CartLine? = nil
    ) throws -> DishScreenModel {
        DishScreenModel(
            item: try menuItem(raw), businessId: business, businessName: name, cartStore: store, clock: clock,
            editing: editing
        )
    }

    // MARK: Editar (CA-CRT-11)

    private func editable() -> BusinessMenu.Item {
        Fixture.item("i1", price: "10", groups: [
            Fixture.group("g", single: true, required: true, options: [Fixture.option("a", "1"), Fixture.option("b", "2")]),
        ])
    }

    private func editedLine(_ option: String, price: String, quantity: Int, note: String? = nil) -> CartLine {
        CartLine(
            itemId: "i1", name: "Plato i1", basePrice: dec("10"),
            modifiers: [CartModifier(optionId: option, groupName: "Grupo g", optionName: "Opción \(option)", price: dec(price))],
            note: note, quantity: quantity, imageURL: nil
        )
    }

    @Test("CA-CRT-11: editar parte de lo elegido y, al guardar otras opciones, la línea cambia en su sitio")
    func editReplacesTheLineInPlace() async throws {
        let store = temporaryStore()
        let original = editedLine("a", price: "1", quantity: 2, note: "sin ají")
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: original)
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: Fixture.line("i2"))
        let model = try model(editable(), store: store, editing: original)
        #expect(model.isEditing)
        #expect(model.selection.selectedIds == ["a"])
        #expect(model.selection.note == "sin ají")
        #expect(model.selection.quantity == 2)

        let group = model.item.dish.groups[0]
        model.toggle(group.options[1], in: group)
        await model.add()
        #expect(model.outcome == .added(capped: false))
        let cart = try #require(await store.current())
        #expect(cart.lines.map(\.itemId) == ["i1", "i2"])
        #expect(cart.lines[0].modifiers.map(\.optionId) == ["b"])
        #expect(cart.lines[0].quantity == 2)
        #expect(cart.lines[0].note == "sin ají")
    }

    @Test("CA-CRT-11: si al editar la línea queda idéntica a otra, se fusionan sumando cantidades")
    func editMergesWithAnIdenticalLine() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: editedLine("a", price: "1", quantity: 1))
        let second = editedLine("b", price: "2", quantity: 2)
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: second)
        let model = try model(editable(), store: store, editing: second)

        let group = model.item.dish.groups[0]
        model.toggle(group.options[0], in: group)
        await model.add()
        #expect(model.outcome == .added(capped: false))
        let cart = try #require(await store.current())
        #expect(cart.lines.count == 1)
        #expect(cart.lines[0].modifiers.map(\.optionId) == ["a"])
        #expect(cart.lines[0].quantity == 3)
    }

    @Test("editar una opción que la carta ya no tiene deja la selección incompleta hasta elegir otra")
    func editWithARemovedOption() async throws {
        let store = temporaryStore()
        let gone = editedLine("zz", price: "1", quantity: 1)
        _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: gone)
        let model = try model(editable(), store: store, editing: gone)
        #expect(model.selection.selectedIds.isEmpty)
        #expect(model.canAdd == false)
    }

    // MARK: Agregar

    @Test("agregar guarda el plato en la bolsa y avisa que se añadió")
    func addSaves() async throws {
        let store = temporaryStore()
        let model = try model(store: store)
        await model.add()
        #expect(model.outcome == .added(capped: false))
        let cart = await store.current()
        #expect(cart?.businessId == "negocio-1")
        #expect(cart?.lines.map(\.itemId) == ["i1"])
        #expect(cart?.lines.first?.quantity == 1)
    }

    @Test("agregar lleva la cantidad, la nota y las opciones elegidas")
    func addCarriesSelection() async throws {
        let raw = Fixture.item("i1", price: "10", groups: [
            Fixture.group("g1", single: true, required: true, options: [Fixture.option("o1", "2.50"), Fixture.option("o2")]),
        ])
        let store = temporaryStore()
        let model = try model(raw, store: store)
        let group = try #require(model.item.dish.groups.first)
        model.toggle(group.options[0], in: group)
        model.setNote("  sin ají  ")
        model.setQuantity(2)
        await model.add()
        let line = try #require(await store.current()?.lines.first)
        #expect(line.modifiers.map(\.optionId) == ["o1"])
        #expect(line.note == "sin ají")
        #expect(line.quantity == 2)
        #expect(line.total == dec("25"))
    }

    @Test("pasarse de 50 avisa que se topó")
    func capped() async throws {
        let store = temporaryStore()
        let model = try model(store: store)
        model.setQuantity(50)
        await model.add()
        model.consumeOutcome()
        model.setQuantity(1)
        await model.add()
        #expect(model.outcome == .added(capped: true))
        #expect(await store.current()?.lines.first?.quantity == 50)
    }

    @Test("un plato de otro restaurante pide decidir; mantener no toca la bolsa")
    func otherBusinessKeep() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "otro", businessName: "Chifa", line: Fixture.line("x"))
        let model = try model(store: store)
        await model.add()
        #expect(model.outcome == .otherBusiness(currentBusinessName: "Chifa", newBusinessName: "Don Lucho"))
        model.keepCurrentBag()
        #expect(model.outcome == nil)
        #expect(await store.current()?.businessId == "otro")
        // «Mantener» descarta lo pendiente: reemplazar ya no hace nada.
        await model.confirmReplace()?.value
        #expect(await store.current()?.businessId == "otro")
    }

    @Test("vaciar y empezar reemplaza la bolsa por el plato pendiente")
    func otherBusinessReplace() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "otro", businessName: "Chifa", line: Fixture.line("x"))
        let model = try model(store: store)
        await model.add()
        await model.confirmReplace()?.value
        #expect(model.outcome == .added(capped: false))
        let cart = await store.current()
        #expect(cart?.businessId == "negocio-1")
        #expect(cart?.lines.map(\.itemId) == ["i1"])
    }

    @Test("el orden real de SwiftUI: cerrar el diálogo (consume) antes de confirmar no pierde la línea")
    func closingTheDialogBeforeConfirmKeepsThePendingLine() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "otro", businessName: "Chifa", line: Fixture.line("x"))
        let model = try model(store: store)
        await model.add()
        model.consumeOutcome()
        await model.confirmReplace()?.value
        let cart = await store.current()
        #expect(cart?.businessId == "negocio-1")
        #expect(cart?.lines.map(\.itemId) == ["i1"])
    }

    @Test("con 50 platos distintos la bolsa está llena y no cambia")
    func full() async throws {
        let store = temporaryStore()
        for n in 0..<CartLimits.maxLines {
            _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: Fixture.line("p\(n)"))
        }
        let model = try model(Fixture.item("nuevo"), store: store)
        await model.add()
        #expect(model.outcome == .full)
        #expect(await store.current()?.lines.count == CartLimits.maxLines)
    }

    @Test("si no se puede guardar en el teléfono, falla y la bolsa queda como estaba")
    func saveFails() async throws {
        let model = try model(store: try unwritableStore())
        await model.add()
        #expect(model.outcome == .failed)
    }

    @Test("un segundo toque mientras se guarda el primero no suma otra vez")
    func singleFlight() async throws {
        let gate = Gate()
        let store = GatedStore(inner: temporaryStore(), gate: gate)
        let model = try model(store: store)
        let first = Task { await model.add() }
        await eventually { model.isAdding }
        await model.add()
        gate.open()
        await first.value
        #expect(await store.addCalls == 1)
        #expect(await store.current()?.lines.first?.quantity == 1)
        #expect(!model.isAdding)
    }

    @Test("sin completar un grupo obligatorio no se puede agregar")
    func invalidSelectionDoesNotAdd() async throws {
        let raw = Fixture.item("i1", groups: [Fixture.group("g1", single: true, required: true, options: [Fixture.option("o1")])])
        let store = temporaryStore()
        let model = try model(raw, store: store)
        #expect(!model.canAdd)
        #expect(model.selection.cta == .complete(missing: 1))
        await model.add()
        #expect(model.outcome == nil)
        #expect(await store.current() == nil)
    }

    // MARK: Lo que se elige

    @Test("elegir una opción obligatoria habilita Agregar con el total")
    func completingEnablesAdd() throws {
        let raw = Fixture.item("i1", price: "10", groups: [
            Fixture.group("g1", single: true, required: true, options: [Fixture.option("o1", "2.50")]),
        ])
        let model = try model(raw, store: temporaryStore())
        let group = try #require(model.item.dish.groups.first)
        model.toggle(group.options[0], in: group)
        #expect(model.canAdd)
        #expect(model.selection.cta == .add(total: "S/\u{00A0}12.50"))
        model.setQuantity(3)
        #expect(model.selection.cta == .add(total: "S/\u{00A0}37.50"))
    }

    @Test("la cantidad se queda entre 1 y 50 y los botones lo dicen")
    func quantityLimits() throws {
        let model = try model(store: temporaryStore())
        #expect(!model.canDecrease)
        model.setQuantity(0)
        #expect(model.selection.quantity == 1)
        model.setQuantity(49)
        #expect(model.canIncrease)
        model.setQuantity(99)
        #expect(model.selection.quantity == 50)
        #expect(!model.canIncrease)
        #expect(model.canDecrease)
    }

    @Test("la nota se corta en 140")
    func noteLimit() throws {
        let model = try model(store: temporaryStore())
        model.setNote(String(repeating: "a", count: 200))
        #expect(model.selection.note.utf16.count == 140)
    }

    // MARK: Avisos

    @Test("bolsa llena y error al guardar se avisan en la ficha, y se apagan solos")
    func noticesStayInSheet() throws {
        let model = try model(store: temporaryStore())
        model.showNotice(for: .full)
        #expect(model.notices.message == "Tu bolsa ya tiene 50 platos distintos: es el máximo por pedido")
        model.showNotice(for: .failed)
        #expect(model.notices.message == "No se pudo guardar tu bolsa. Inténtalo de nuevo.")
        model.notices.clear()
        // «Añadido» lo enseña la carta, no la ficha.
        model.showNotice(for: .added(capped: false))
        #expect(model.notices.message == nil)
    }

    @Test("la foto de la cabecera es la grande; la de la fila, la miniatura")
    func heroAndThumbnail() throws {
        let item = try menuItem(Fixture.item("i1", image: "https://x/grande.jpg"))
        #expect(item.heroURL == "https://x/grande.jpg")
        #expect(item.imageURL == "https://x/grande.jpg")
    }
}
