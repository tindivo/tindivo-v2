import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// `validateCartAgainstCatalog` de la web (`apps/customer/lib/cart-validation.ts`): los mismos casos.
@Suite("Bolsa contra la carta vigente")
struct CartValidationTests {
    private let now = Fixture.tuesdayEvening

    private func detail(_ items: [BusinessMenu.Item]) throws -> BusinessDetail {
        try #require(MenuMapping.detail(from: Fixture.menu([Fixture.category("c", items)])))
    }

    private func line(
        _ id: String, price: String = "12.50", modifiers: [CartModifier] = [], quantity: Int = 1
    ) -> CartLine {
        CartLine(itemId: id, name: "Plato \(id)", basePrice: dec(price), modifiers: modifiers, note: nil, quantity: quantity, imageURL: nil)
    }

    private func modifier(_ id: String, _ price: String) -> CartModifier {
        CartModifier(optionId: id, groupName: "Grupo g", optionName: "Opción \(id)", price: dec(price))
    }

    private func issues(of lines: [CartLine], in items: [BusinessMenu.Item]) throws -> [[CartLineIssue]] {
        CartValidation.issues(
            of: Cart(businessId: "negocio-1", businessName: "Don Lucho", lines: lines), against: try detail(items), now: now
        )
    }

    private let sizes = Fixture.group("g", single: true, required: true, options: [Fixture.option("a", "1"), Fixture.option("b", "2")])

    @Test("CA-CRT-05: una línea igual a la carta no tiene avisos, aunque el precio se escriba distinto (12.5 y 12.50)")
    func validLine() throws {
        let result = try issues(of: [line("i1", price: "12.5")], in: [Fixture.item("i1", price: "12.50")])
        #expect(result == [[]])
    }

    @Test("CA-CRT-05: un plato que ya no está en la carta")
    func removedDish() throws {
        let result = try issues(of: [line("gone")], in: [Fixture.item("i1")])
        #expect(result == [[.removed]])
    }

    @Test("CA-CRT-05: un plato agotado")
    func unavailableDish() throws {
        let result = try issues(of: [line("i1")], in: [Fixture.item("i1", available: false)])
        #expect(result == [[.unavailable]])
    }

    @Test("CA-CRT-05: un plato fuera de su franja dice cuándo vuelve")
    func outOfWindowDish() throws {
        let result = try issues(of: [line("i1")], in: [Fixture.item("i1", from: "11:00", to: "15:00")])
        let returns = DishWindow(days: nil, from: "11:00", to: "15:00").describe()
        #expect(returns != nil)
        #expect(result == [[.outOfWindow(returns: returns)]])
    }

    @Test("CA-CRT-05: un plato dentro de su franja se puede pedir")
    func insideWindowDish() throws {
        let result = try issues(of: [line("i1")], in: [Fixture.item("i1", from: "18:00", to: "23:00")])
        #expect(result == [[]])
    }

    @Test("CA-CRT-05: el precio base cambió")
    func basePriceChanged() throws {
        let result = try issues(of: [line("i1", price: "10")], in: [Fixture.item("i1", price: "12")])
        #expect(result == [[.priceChanged(delta: dec("2"))]])
        #expect(CartLineIssue.priceChanged(delta: dec("2")).message.plain == "Precio actualizado (+S/ 2.00)")
        #expect(CartLineIssue.priceChanged(delta: dec("-0.5")).message.plain == "Precio actualizado (-S/ 0.50)")
    }

    @Test("CA-CRT-05: el precio de una opción cambió")
    func optionPriceChanged() throws {
        let result = try issues(
            of: [line("i1", modifiers: [modifier("a", "0.50")])],
            in: [Fixture.item("i1", groups: [sizes])]
        )
        #expect(result == [[.optionPriceChanged(optionName: "Opción a"), .priceChanged(delta: dec("0.5"))]])
    }

    @Test("CA-CRT-05: una opción que ya no existe")
    func optionRemoved() throws {
        let result = try issues(
            of: [line("i1", modifiers: [modifier("zz", "1")])],
            in: [Fixture.item("i1", groups: [sizes])]
        )
        #expect(result == [[.optionRemoved]])
    }

    @Test("CA-CRT-05: el negocio añadió un grupo obligatorio y lo elegido ya no cumple las reglas")
    func invalidSelection() throws {
        let result = try issues(of: [line("i1")], in: [Fixture.item("i1", groups: [sizes])])
        #expect(result == [[.invalidSelection]])
    }

    @Test("CA-CRT-05: opciones iguales a la carta no dan aviso")
    func matchingOptions() throws {
        let result = try issues(
            of: [line("i1", modifiers: [modifier("b", "2")])],
            in: [Fixture.item("i1", groups: [sizes])]
        )
        #expect(result == [[]])
    }

    @Test("los avisos van en el orden de las líneas")
    func orderFollowsTheLines() throws {
        let result = try issues(
            of: [line("i1"), line("i2"), line("gone")],
            in: [Fixture.item("i1", order: 1), Fixture.item("i2", order: 2, available: false)]
        )
        #expect(result == [[], [.unavailable], [.removed]])
    }
}
