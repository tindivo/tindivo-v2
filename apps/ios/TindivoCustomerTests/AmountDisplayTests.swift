import Foundation
import Testing
import TindivoAPI

@testable import TindivoCustomer

/// Solo visualización: un importe que no se puede mostrar («—») se lee, avisa y no deja agregar. Ningún cálculo cambia.
@MainActor
@Suite("Importes que no se pueden mostrar")
struct AmountDisplayTests {
    @Test("CA-CRT-15 VoiceOver lee «Precio no disponible» donde se ve «—», y deja lo demás como está")
    func spokenText() {
        #expect(spokenAmountText(invalidAmountText) == "Precio no disponible")
        #expect(spokenAmountText("3 productos · —") == "3 productos · Precio no disponible")
        #expect(spokenAmountText("S/ 12.50") == "S/ 12.50")
        #expect(spokenAmountText("Agregar · —") == "Agregar · Precio no disponible")
    }

    private func cartLine(_ id: String, price: String, quantity: Int = 1) -> CartLine {
        CartLine(
            itemId: id, name: "Plato \(id)", basePrice: dec(price), modifiers: [], note: nil, quantity: quantity,
            imageURL: nil)
    }

    @Test("CA-CRT-15 con una línea en «—» el subtotal también es «—», aunque la suma dé un número que se puede mostrar")
    func subtotalWithABrokenLine() {
        // 0.005 + 0.005 = 0.01: la suma «se puede mostrar», pero cada línea es un dato roto (decisión de Jesús, 2026-11-27).
        let broken = Cart(
            businessId: "negocio-1", businessName: "N",
            lines: [cartLine("a", price: "0.005"), cartLine("b", price: "0.005")])
        #expect(displaySubtotal(of: broken) == invalidAmountText)
        let mixed = Cart(
            businessId: "negocio-1", businessName: "N",
            lines: [cartLine("a", price: "12.50"), cartLine("b", price: "0.005")])
        #expect(displaySubtotal(of: mixed) == invalidAmountText)
    }

    @Test("CUS-CRT-015 sin líneas rotas el subtotal es la suma exacta, igual que antes")
    func subtotalWithValidLines() {
        let cart = Cart(
            businessId: "negocio-1", businessName: "N",
            lines: [cartLine("a", price: "12.50", quantity: 2), cartLine("b", price: "5.00")])
        #expect(displaySubtotal(of: cart) == displayAmount(dec("30.00")))
    }

    @Test("CA-CRT-15 la barra «Ver bolsa» de la carta tampoco muestra un total parcial")
    func cartBarWithABrokenLine() throws {
        let broken = Cart(
            businessId: "negocio-1", businessName: "N",
            lines: [cartLine("a", price: "0.005"), cartLine("b", price: "0.005")])
        let bar = try #require(cartBar(for: broken, businessId: "negocio-1"))
        #expect(bar.subtotal == invalidAmountText)
    }

    /// La carta ya descarta los precios rotos: para probar el dato roto se arma el plato a mano.
    private func store(price: String) -> DishScreenModel {
        let dish = Dish(id: "i1", name: "Plato", basePrice: dec(price), imageURL: nil, groups: [])
        let item = MenuItem(
            dish: dish, description: nil, priceText: "", isAvailable: true,
            window: DishWindow(days: nil, from: nil, to: nil))
        return DishScreenModel(
            item: item, businessId: "negocio-1", businessName: "N", cartStore: temporaryStore(),
            clock: .fixed(Fixture.tuesdayEvening), editing: nil)
    }

    @Test("con el total en «—» el botón «Agregar» queda deshabilitado y add() no agrega nada")
    func addIsDisabledWithABrokenTotal() async throws {
        let broken = store(price: "1.005")
        #expect(broken.selection.isValid)
        #expect(broken.ctaTitle.hasSuffix("—"), "el total no se pudo mostrar: \(broken.ctaTitle)")
        #expect(broken.ctaDisabled)
        #expect(!broken.ctaBlocked, "no falta ningún grupo: VoiceOver no dice «Te lleva al grupo que falta»")
        #expect(!broken.canAdd)
        await broken.add()
        #expect(broken.outcome == nil, "no se agregó")

        let fine = store(price: "12.50")
        #expect(!fine.ctaDisabled)
        #expect(fine.canAdd)
    }

    private func lineRow(_ id: String) -> CartLineRow {
        CartLineRow(
            signature: id, name: id, options: [], note: nil, quantity: 1, total: "S/ 10.00", decreaseRemoves: true,
            canIncrease: true, decreaseLabel: "", increaseLabel: "", issues: [], canEdit: false)
    }

    private func filled(subtotal: String, lines: [CartLineRow]) -> CartScreenModel.Filled {
        CartScreenModel.Filled(
            businessId: "n", businessName: "N", lines: lines, subtotal: subtotal, amountsAreValid: false,
            method: .delivery, validation: .checked, countLabel: "")
    }

    @Test(
        "subtotal en «—» con todas las líneas válidas: aviso de subtotal; CA-CRT-15 con una línea rota, aviso de precio"
    )
    func bagLevelNotice() {
        #expect(
            filled(subtotal: invalidAmountText, lines: [lineRow("a")]).amountNotice
                == "No pudimos calcular el subtotal de tu bolsa. Revisa las cantidades.")
        #expect(filled(subtotal: "S/ 10.00", lines: [lineRow("a")]).amountNotice == nil)
        let broken = CartLineRow(
            signature: "b", name: "b", options: [], note: nil, quantity: 1, total: invalidAmountText,
            decreaseRemoves: true, canIncrease: true, decreaseLabel: "", increaseLabel: "", issues: ["x"],
            canEdit: false)
        #expect(
            filled(subtotal: invalidAmountText, lines: [lineRow("a"), broken]).amountNotice
                == "No podemos mostrar un precio. Intenta de nuevo en un rato.")
    }
}
