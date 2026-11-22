import Foundation
import Testing
@testable import TindivoCustomer

/// `CartTest.kt`: las reglas de la bolsa, sin disco.
@Suite("Bolsa")
struct CartTests {
    private func line(
        _ itemId: String = "plato", price: String = "12.50", modifiers: [CartModifier] = [], note: String? = nil,
        quantity: Int = 1, name: String = "Lomo saltado"
    ) -> CartLine {
        CartLine(
            itemId: itemId, name: name, basePrice: dec(price), modifiers: modifiers, note: note, quantity: quantity,
            imageURL: nil
        )
    }

    private func mod(_ id: String, _ price: String) -> CartModifier {
        CartModifier(optionId: id, groupName: "Extras", optionName: id, price: dec(price))
    }

    private func added(_ result: AddResult) throws -> (cart: Cart, capped: Bool) {
        guard case let .added(cart, capped) = result else {
            throw CartTestError.notAdded(result)
        }
        return (cart, capped)
    }

    private enum CartTestError: Error { case notAdded(AddResult) }

    @Test("el subtotal es exacto en céntimos sin pasar por Double")
    func exactSubtotal() {
        // 0.10 + 0.20 en Double da 0.30000000000000004: aquí tiene que dar 0.30 exacto.
        #expect(Cart(businessId: "n", businessName: "Negocio", lines: [line("a", price: "0.10"), line("b", price: "0.20")]).subtotal == dec("0.30"))
        let many = Cart(businessId: "n", businessName: "Negocio", lines: (0..<3).map { line("x\($0)", price: "33.33", quantity: 3) })
        #expect(many.subtotal == dec("299.97"))
    }

    @Test("el precio unitario suma las opciones y el total multiplica por la cantidad")
    func unitAndTotal() {
        let withOptions = line(price: "18.00", modifiers: [mod("queso", "2.50"), mod("palta", "0.00")], quantity: 3)
        #expect(withOptions.unitPrice == dec("20.50"))
        #expect(withOptions.total == dec("61.50"))
        #expect(Cart(businessId: "n", businessName: "Negocio", lines: [withOptions]).count == 3)
    }

    @Test("la misma firma suma cantidades y se queda con el precio más reciente")
    func mergesSameSignature() throws {
        let first = try added(addToCart(nil, businessId: "n", businessName: "Negocio", line: line(quantity: 2))).cart
        let second = try added(addToCart(first, businessId: "n", businessName: "Negocio", line: line(price: "13.00", quantity: 3))).cart
        #expect(second.lines.count == 1)
        #expect(second.lines.first?.quantity == 5)
        #expect(second.lines.first?.basePrice == dec("13.00"))
    }

    @Test("la firma ignora el orden y las mayúsculas de las opciones y los bordes de la nota")
    func signature() {
        let a = line(modifiers: [mod("B", "1.00"), mod("a", "1.00")], note: " sin cebolla ")
        let b = line(modifiers: [mod("A", "1.00"), mod("b", "1.00")], note: "sin cebolla")
        #expect(a.signature == b.signature)
        #expect(a.signature != line(note: "sin ají").signature)
        #expect(a.signature != line(modifiers: [mod("a", "1.00")]).signature)
    }

    @Test("otra nota u otras opciones son otra línea")
    func otherNote() throws {
        let cart = try added(addToCart(nil, businessId: "n", businessName: "Negocio", line: line())).cart
        let withNote = try added(addToCart(cart, businessId: "n", businessName: "Negocio", line: line(note: "bien cocido"))).cart
        #expect(withNote.lines.count == 2)
    }

    @Test("la suma no pasa de 50 y lo avisa")
    func cap() throws {
        let cart = try added(addToCart(nil, businessId: "n", businessName: "Negocio", line: line(quantity: 40))).cart
        let over = try added(addToCart(cart, businessId: "n", businessName: "Negocio", line: line(quantity: 20)))
        #expect(over.capped)
        #expect(over.cart.lines.first?.quantity == CartLimits.maxQuantity)
        #expect(try !added(addToCart(cart, businessId: "n", businessName: "Negocio", line: line(quantity: 10))).capped)
    }

    @Test("un plato de otro negocio no toca la bolsa; replacedWith empieza una nueva")
    func otherBusiness() throws {
        let cart = try added(addToCart(nil, businessId: "n1", businessName: "Pollería", line: line())).cart
        #expect(try addToCart(cart, businessId: "n2", businessName: "Chifa", line: line()) == .otherBusiness(currentBusinessName: "Pollería"))
        let fresh = try replacedWith(businessId: "n2", businessName: "Chifa", line: line("arroz"))
        #expect(fresh.businessId == "n2")
        #expect(fresh.lines.map(\.itemId) == ["arroz"])
    }

    @Test("el mismo negocio con el uuid en mayúsculas es el mismo negocio")
    func caseInsensitiveBusiness() throws {
        let id = "abcdefab-1234-4000-8000-abcdef123456"
        let cart = try added(addToCart(nil, businessId: id, businessName: "Negocio", line: line())).cart
        guard case .added = try addToCart(cart, businessId: id.uppercased(), businessName: "Negocio", line: line()) else {
            Issue.record("era el mismo negocio")
            return
        }
    }

    @Test("una bolsa vacía acepta cualquier negocio")
    func emptyAcceptsAny() throws {
        let empty = Cart(businessId: "n1", businessName: "Pollería", lines: [])
        #expect(try added(addToCart(empty, businessId: "n2", businessName: "Chifa", line: line())).cart.businessId == "n2")
    }

    @Test("la cantidad se mantiene entre 1 y 50 y quitar la línea la borra")
    func quantityAndRemove() throws {
        let cart = Cart(businessId: "n", businessName: "Negocio", lines: [line(quantity: 2)])
        let signature = try #require(cart.lines.first?.signature)
        #expect(cart.settingQuantity(of: signature, to: 0).lines.first?.quantity == 1)
        #expect(cart.settingQuantity(of: signature, to: 99).lines.first?.quantity == CartLimits.maxQuantity)
        #expect(cart.removingLine(signature).isEmpty)
    }

    @Test("no se añade una línea con cantidad fuera de rango")
    func invalidQuantity() {
        #expect(throws: CartError.invalidQuantity) {
            try addToCart(nil, businessId: "n", businessName: "Negocio", line: line(quantity: 0))
        }
        #expect(throws: CartError.invalidQuantity) {
            try replacedWith(businessId: "n", businessName: "Negocio", line: line(quantity: 51))
        }
    }

    @Test("la nota se guarda sin bordes, vacía es nil y no pasa de 140")
    func note() {
        #expect(normalizeNote("  sin cebolla \n") == "sin cebolla")
        #expect(normalizeNote("   ") == nil)
        #expect(normalizeNote(String(repeating: "a", count: 200))?.count == CartLimits.maxNoteLength)
        // El tope cuenta unidades UTF-16 (como `.max(140)` del contrato): un emoji son dos y no se parte.
        let emojis = normalizeNote(String(repeating: "🍕", count: 100))
        #expect(emojis?.utf16.count == 140)
        #expect(emojis?.count == 70)
    }

    @Test("con 50 platos distintos no entra otro y la bolsa no cambia, pero el mismo plato sí suma")
    func fullCart() throws {
        let full = Cart(businessId: "n", businessName: "Negocio", lines: (0..<CartLimits.maxLines).map { line("p\($0)") })
        #expect(try addToCart(full, businessId: "n", businessName: "Negocio", line: line("otro")) == .full)
        let merged = try added(addToCart(full, businessId: "n", businessName: "Negocio", line: line("p0")))
        #expect(merged.cart.lines.count == CartLimits.maxLines)
        #expect(merged.cart.lines.first?.quantity == 2)
    }

    @Test("la huella no depende del orden ni de los precios")
    func fingerprint() {
        let a = Cart(businessId: "ABC", businessName: "N", lines: [line("a"), line("b", quantity: 2)])
        let b = Cart(businessId: "abc", businessName: "Otro nombre", lines: [line("b", price: "99.00", quantity: 2), line("a")])
        #expect(a.fingerprint() == b.fingerprint())
        #expect(a.fingerprint() != Cart(businessId: "abc", businessName: "N", lines: [line("a")]).fingerprint())
    }
}
