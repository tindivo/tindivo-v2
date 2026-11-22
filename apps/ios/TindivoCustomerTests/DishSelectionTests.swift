import Foundation
import Testing
@testable import TindivoCustomer

/// `DishSheetStateTest.kt`: la elección de la ficha del plato, sin nada de UI.
@Suite("Elección de opciones de un plato")
struct DishSelectionTests {
    private func option(_ id: String, _ price: String = "0.00") -> DishOption {
        DishOption(id: id, name: id, description: nil, price: dec(price), priceText: "S/ \(price)")
    }

    private func group(
        _ id: String, _ type: String, required: Bool, min: Int = 0, max: Int? = nil, display: String = "delta",
        _ options: [DishOption]
    ) -> DishGroup {
        DishGroup(
            id: id, name: id, selectionType: type, isRequired: required, minSelections: min, maxSelections: max,
            priceDisplay: display, options: options
        )
    }

    private var size: DishGroup { group("size", "single", required: true, [option("small"), option("large", "4.00")]) }
    private var sauce: DishGroup { group("sauce", "single", required: false, [option("ajo"), option("rocoto", "1.00")]) }
    private var extras: DishGroup {
        group(
            "extras", "multi", required: false, max: 2,
            [option("queso", "2.50"), option("palta", "3.00"), option("huevo", "1.50")]
        )
    }

    private func dish(_ groups: [DishGroup], price: String = "18.00") -> Dish {
        Dish(id: "plato", name: "Pollo", basePrice: dec(price), imageURL: nil, groups: groups)
    }

    private var full: DishSelection { DishSelection(dish: dish([size, sauce, extras])) }

    private func tap(_ state: DishSelection, _ group: DishGroup, _ optionId: String) -> DishSelection {
        guard let option = group.options.first(where: { $0.id == optionId }) else { return state }
        return state.toggling(option, in: group)
    }

    @Test("un plato sin opciones es válido de entrada y no preselecciona nada")
    func plain() {
        let state = DishSelection(dish: dish([]))
        #expect(state.isValid)
        #expect(state.cta == .add(total: formatSoles(dec("18.00"))))
        #expect(full.selectedIds.isEmpty)
    }

    @Test("CA-CAT-06 single obligatorio reemplaza la opción y tocar la elegida no la quita")
    func singleRequired() {
        var state = tap(full, size, "small")
        #expect(state.selectedIds == ["small"])
        state = tap(state, size, "large")
        #expect(state.selectedIds == ["large"])
        state = tap(state, size, "large")
        #expect(state.selectedIds == ["large"])
    }

    @Test("CA-CAT-06 single opcional reemplaza y tocar la elegida la quita")
    func singleOptional() {
        var state = tap(tap(full, sauce, "ajo"), sauce, "rocoto")
        #expect(state.selectedIds == ["rocoto"])
        state = tap(state, sauce, "rocoto")
        #expect(state.selectedIds.isEmpty)
    }

    @Test("multi alterna y al llegar al tope deshabilita las no elegidas")
    func multiCap() throws {
        var state = tap(tap(full, extras, "queso"), extras, "palta")
        let huevo = try #require(extras.options.first { $0.id == "huevo" })
        let queso = try #require(extras.options.first { $0.id == "queso" })
        #expect(state.isDisabled(huevo, in: extras))
        #expect(!state.isDisabled(queso, in: extras))
        // Tocar una deshabilitada no hace nada.
        #expect(Set(tap(state, extras, "huevo").selectedIds) == ["queso", "palta"])
        state = tap(state, extras, "queso")
        #expect(!state.isDisabled(huevo, in: extras))
        #expect(state.selectedIds == ["palta"])
    }

    @Test("un grupo no toca las elecciones de otro")
    func independentGroups() {
        let state = tap(tap(tap(full, size, "small"), extras, "queso"), sauce, "ajo")
        #expect(Set(state.selectedIds) == ["small", "queso", "ajo"])
        #expect(Set(tap(state, sauce, "ajo").selectedIds) == ["small", "queso"])
    }

    @Test("CA-CAT-06 el botón pide completar los grupos obligatorios y después agrega")
    func ctaFlow() {
        let cook = group("cook", "single", required: true, [option("medio"), option("bien")])
        var state = DishSelection(dish: dish([size, cook]))
        #expect(!state.isValid)
        #expect(state.cta == .complete(missing: 2))
        state = tap(state, size, "small")
        #expect(state.cta == .complete(missing: 1))
        #expect(state.missing == 1)
        state = tap(state, cook, "medio")
        #expect(state.isValid)
        guard case .add = state.cta else {
            Issue.record("debía poder agregar: \(state.cta)")
            return
        }
    }

    @Test("el progreso del grupo dice si está listo y cuántas lleva")
    func progress() {
        var state = full
        #expect(state.progress(of: size) == GroupProgress(required: true, done: false, single: true, count: 0, max: 1))
        #expect(state.progress(of: extras) == GroupProgress(required: false, done: false, single: false, count: 0, max: 2))
        state = tap(tap(state, size, "small"), extras, "queso")
        #expect(state.progress(of: size) == GroupProgress(required: true, done: true, single: true, count: 1, max: 1))
        #expect(state.progress(of: extras).count == 1)
    }

    @Test("un multi sin tope no deshabilita nada")
    func unlimitedMulti() {
        let free = group("free", "multi", required: false, [option("a"), option("b"), option("c")])
        let state = tap(tap(DishSelection(dish: dish([free])), free, "a"), free, "b")
        #expect(state.progress(of: free).max == nil)
        #expect(!state.isDisabled(free.options[2], in: free))
    }

    @Test("CA-CAT-07 el precio total suma opciones y multiplica por la cantidad sin redondear")
    func totals() {
        let state = tap(tap(tap(full, size, "large"), extras, "queso"), extras, "palta").withQuantity(3)
        #expect(state.unitPrice == dec("27.50"))
        #expect(state.total == dec("82.50"))
        #expect(state.cta == .add(total: formatSoles(dec("82.50"))))
    }

    @Test("la cantidad se mantiene entre 1 y 50 y la nota se corta en 140")
    func limits() {
        let state = DishSelection(dish: dish([]))
        #expect(state.withQuantity(0).quantity == 1)
        #expect(state.withQuantity(99).quantity == CartLimits.maxQuantity)
        #expect(state.withQuantity(7).quantity == 7)
        #expect(state.withNote(String(repeating: "a", count: 170)).note.count == CartLimits.maxNoteLength)
    }

    @Test("CA-CAT-07 el precio de la opción es incluido, un delta o el total del plato")
    func optionPrice() {
        let state = full
        #expect(state.optionPrice(of: size.options[0], in: size) == .included)
        #expect(state.optionPrice(of: size.options[1], in: size) == .delta("S/ 4.00"))
        let total = group("t", "single", required: true, display: "total", [option("grande", "2.50")])
        #expect(DishSelection(dish: dish([total])).optionPrice(of: total.options[0], in: total)
            == .total(formatSoles(dec("20.50"))))
        #expect(OptionPrice.included.displayText == "Incluido")
        #expect(OptionPrice.delta("S/ 4.00").displayText == "+S/ 4.00")
    }

    @Test("la línea sale con la nota normalizada y las opciones elegidas")
    func line() throws {
        let state = tap(tap(full, size, "large"), extras, "queso").withNote("  sin cebolla ").withQuantity(2)
        let line = try #require(state.toLine())
        #expect(line.itemId == "plato")
        #expect(line.note == "sin cebolla")
        #expect(line.quantity == 2)
        #expect(line.modifiers.map(\.optionId) == ["large", "queso"])
        #expect(line.modifiers.map(\.groupName) == ["size", "extras"])
        #expect(line.total == dec("49.00"))
    }

    @Test("no se arma la línea de una selección incompleta, y una nota en blanco no viaja")
    func lineGuards() throws {
        #expect(full.toLine() == nil)
        #expect(try #require(DishSelection(dish: dish([])).withNote("   ").toLine()).note == nil)
    }

    @Test("no se pasa del máximo de opciones del pedido")
    func maxModifiers() {
        let many = group("many", "multi", required: false, (0..<(CartLimits.maxModifiers + 5)).map { option("o\($0)") })
        var state = DishSelection(dish: dish([many]))
        for option in many.options { state = state.toggling(option, in: many) }
        #expect(state.selectedIds.count == CartLimits.maxModifiers)
        #expect(state.isValid)
    }

    @Test("con 20 opciones elegidas se puede cambiar la de un grupo single y siguen siendo 20")
    func swapAtTheCeiling() throws {
        let many = group("many", "multi", required: false, (0..<(CartLimits.maxModifiers - 1)).map { option("o\($0)", "1.00") })
        let one = group("one", "single", required: true, [option("a", "2.00"), option("b", "3.00")])
        var state = tap(DishSelection(dish: dish([many, one])), one, "a")
        for option in many.options { state = state.toggling(option, in: many) }
        #expect(state.selectedIds.count == CartLimits.maxModifiers)
        let b = try #require(one.options.first { $0.id == "b" })
        #expect(!state.isDisabled(b, in: one))
        let swapped = state.toggling(b, in: one)
        #expect(swapped.selectedIds.count == CartLimits.maxModifiers)
        #expect(swapped.selectedIds.contains("b") && !swapped.selectedIds.contains("a"))
        #expect(swapped.isValid)
        // 18.00 + 19 × 1.00 + 3.00
        #expect(swapped.toLine()?.unitPrice == dec("40.00"))
    }

    @Test("con 20 opciones elegidas un grupo single vacío no suma la 21")
    func noTwentyFirst() throws {
        let many = group("many", "multi", required: false, (0..<CartLimits.maxModifiers).map { option("o\($0)") })
        let one = group("one", "single", required: false, [option("a")])
        var state = DishSelection(dish: dish([many, one]))
        for option in many.options { state = state.toggling(option, in: many) }
        let a = try #require(one.options.first)
        #expect(state.isDisabled(a, in: one))
        #expect(state.toggling(a, in: one) == state)
    }

    @Test("si el plato repite una opción la selección no vale y el botón no muestra importe")
    func repeatedOption() {
        // CAX-004: aunque la carta lo descarta al mapearla, la ficha tampoco suma dos veces una opción elegida una vez.
        let top = "99999999.99"
        let repeated = group("rep", "multi", required: false, (0..<1050).map { _ in option("x", top) })
        var state = DishSelection(dish: dish([repeated], price: top)).withQuantity(CartLimits.maxQuantity)
        state = tap(state, repeated, "x")
        #expect(state.selectedIds == ["x"])
        #expect(!state.isValid)
        guard case .complete = state.cta else {
            Issue.record("no debía poder agregar: \(state.cta)")
            return
        }
    }
}
