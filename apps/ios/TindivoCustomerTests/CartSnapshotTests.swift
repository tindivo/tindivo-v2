import Foundation
import Testing
@testable import TindivoCustomer

/// `CartSnapshotTest.kt`: lo que se guarda en disco y cuándo se descarta (falla cerrado).
@Suite("Bolsa guardada en el teléfono")
struct CartSnapshotTests {
    private func line(
        _ itemId: String = "plato", price: String = "12.50",
        modifiers: [CartModifier]? = nil, note: String? = "sin cebolla", quantity: Int = 2
    ) -> CartLine {
        CartLine(
            itemId: itemId, name: "Lomo saltado", basePrice: dec(price),
            modifiers: modifiers ?? [CartModifier(optionId: "queso", groupName: "Extras", optionName: "Queso", price: dec("2.50"))],
            note: note, quantity: quantity, imageURL: "https://img/x.webp"
        )
    }

    private var cart: Cart {
        Cart(businessId: "negocio", businessName: "Pollería", lines: [line(), line("otro", modifiers: [], note: nil)])
    }

    private func snapshot() throws -> CartSnapshot { try #require(cart.snapshot()) }

    private func lineSnapshot(
        basePrice: String = "12.50", quantity: Int = 1, modifiers: [CartModifierSnapshot] = [], note: String? = nil,
        itemId: String = "plato"
    ) -> CartLineSnapshot {
        CartLineSnapshot(
            itemId: itemId, name: "Lomo", basePrice: basePrice, modifiers: modifiers, note: note, quantity: quantity,
            imageURL: nil
        )
    }

    private func with(_ lines: [CartLineSnapshot]) throws -> CartSnapshot {
        var snapshot = try snapshot()
        snapshot.lines = lines
        return snapshot
    }

    @Test("ida y vuelta conserva los importes exactos")
    func roundTrip() throws {
        let snapshot = try snapshot()
        #expect(snapshot.lines[0].basePrice == "12.50")
        #expect(snapshot.lines[0].modifiers.first?.price == "2.50")
        let restored = try #require(Cart(snapshot: snapshot))
        #expect(restored == cart)
        #expect(restored.lines[0].basePrice == dec("12.50"))
        #expect(restored.lines[0].unitPrice == dec("15.00"))
        #expect(restored.subtotal == cart.subtotal)
    }

    @Test("una bolsa vacía se guarda como sin bolsa")
    func emptyIsNil() {
        #expect(Cart(businessId: "n", businessName: "Negocio", lines: []).snapshot() == nil)
    }

    @Test("una versión distinta de 1 descarta la bolsa")
    func version() throws {
        var snapshot = try snapshot()
        snapshot.version = 2
        #expect(Cart(snapshot: snapshot) == nil)
        snapshot.version = 0
        #expect(Cart(snapshot: snapshot) == nil)
    }

    @Test("un importe ilegible o fuera de numeric(10,2) descarta la bolsa")
    func badAmounts() throws {
        for bad in ["abc", "", "1.005", "-1", "100000000", "1e2147483647", "NaN"] {
            #expect(try Cart(snapshot: with([lineSnapshot(basePrice: bad)])) == nil, "\(bad)")
            let modifier = CartModifierSnapshot(optionId: "queso", groupName: "Extras", optionName: "Queso", price: bad)
            #expect(try Cart(snapshot: with([lineSnapshot(modifiers: [modifier])])) == nil, "\(bad)")
        }
    }

    @Test("una cantidad fuera de 1 a 50 descarta la bolsa")
    func badQuantity() throws {
        #expect(try Cart(snapshot: with([lineSnapshot(quantity: 0)])) == nil)
        #expect(try Cart(snapshot: with([lineSnapshot(quantity: CartLimits.maxQuantity + 1)])) == nil)
        #expect(try Cart(snapshot: with([lineSnapshot(quantity: -3)])) == nil)
        #expect(try Cart(snapshot: with([lineSnapshot(quantity: CartLimits.maxQuantity)]))?.count == CartLimits.maxQuantity)
    }

    @Test("más opciones que el máximo del pedido descartan la bolsa")
    func tooManyOptions() throws {
        func options(_ n: Int) -> [CartModifierSnapshot] {
            (0..<n).map { CartModifierSnapshot(optionId: "o\($0)", groupName: "Extras", optionName: "Opción \($0)", price: "1.00") }
        }
        #expect(try Cart(snapshot: with([lineSnapshot(modifiers: options(CartLimits.maxModifiers + 1))])) == nil)
        #expect(try Cart(snapshot: with([lineSnapshot(modifiers: options(CartLimits.maxModifiers))])) != nil)
    }

    @Test("una nota de más de 140 caracteres descarta la bolsa")
    func longNote() throws {
        #expect(try Cart(snapshot: with([lineSnapshot(note: String(repeating: "a", count: 141))])) == nil)
        #expect(try Cart(snapshot: with([lineSnapshot(note: String(repeating: "a", count: 140))])) != nil)
    }

    @Test("dos líneas con la misma firma descartan la bolsa")
    func sameSignature() throws {
        #expect(try Cart(snapshot: with([lineSnapshot(), lineSnapshot()])) == nil)
        #expect(try Cart(snapshot: with([lineSnapshot(itemId: "A"), lineSnapshot(itemId: "a")])) == nil)
    }

    @Test("una opción repetida en una línea descarta la bolsa entera")
    func repeatedOption() throws {
        let queso = CartModifierSnapshot(optionId: "6f1c0000-0000-4000-8000-00000000000a", groupName: "Extras", optionName: "Queso", price: "2.50")
        var upper = queso
        upper.optionId = queso.optionId.uppercased()
        let valid = lineSnapshot(itemId: "otro")
        #expect(try Cart(snapshot: with([valid, lineSnapshot(modifiers: [queso, queso])])) == nil)
        #expect(try Cart(snapshot: with([valid, lineSnapshot(modifiers: [queso, upper])])) == nil)
        #expect(try Cart(snapshot: with([valid, lineSnapshot(modifiers: [queso])])) != nil)
    }

    @Test("más de 50 platos distintos descartan la bolsa")
    func tooManyLines() throws {
        func lines(_ n: Int) -> [CartLineSnapshot] { (0..<n).map { lineSnapshot(itemId: "p\($0)") } }
        #expect(try Cart(snapshot: with(lines(CartLimits.maxLines)))?.lines.count == CartLimits.maxLines)
        #expect(try Cart(snapshot: with(lines(CartLimits.maxLines + 1))) == nil)
    }

    @Test("sin negocio o sin líneas no hay bolsa")
    func noBusinessOrLines() throws {
        var blank = try snapshot()
        blank.businessId = " "
        #expect(Cart(snapshot: blank) == nil)
        #expect(try Cart(snapshot: with([])) == nil)
    }

    @Test("el codec escribe la versión y lee lo que escribió")
    func codec() throws {
        let data = try CartSnapshotCodec.encode(snapshot())
        #expect(String(decoding: data, as: UTF8.self).contains("\"version\":1"))
        #expect(try CartSnapshotCodec.decode(data) == snapshot())
    }

    @Test("el codec con bytes corruptos lanza, para que el almacén lo trate como sin bolsa")
    func corrupt() {
        let corrupt: [String] = [
            "",
            "{\"version\":1,\"businessId\":",
            "[]",
            "null",
            // Una clave de más: el formato es exactamente el conocido.
            "{\"version\":1,\"businessId\":\"n\",\"businessName\":\"N\",\"lines\":[],\"extra\":1}",
            // Un importe como número JSON en vez de cadena.
            "{\"version\":1,\"businessId\":\"n\",\"businessName\":\"N\",\"lines\":[{\"itemId\":\"a\",\"name\":\"A\",\"basePrice\":12.5,\"modifiers\":[],\"note\":null,\"quantity\":1,\"imageURL\":null}]}",
        ]
        for text in corrupt {
            #expect(throws: (any Error).self, "\(text)") { try CartSnapshotCodec.decode(Data(text.utf8)) }
        }
        #expect(throws: (any Error).self) { try CartSnapshotCodec.decode(Data([0x00, 0x7F, 0xFF])) }
    }
}
