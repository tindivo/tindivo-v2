import Foundation
import Testing
@testable import TindivoCustomer

@Suite("Dinero de la carta y de la bolsa (MoneyTest.kt)")
struct MoneyTests {
    @Test("formatAmount muestra importes exactos de la bolsa")
    func formatsExact() {
        #expect(formatAmount(dec("0.30")).plain == "S/ 0.30")
        #expect(formatAmount(dec("299.97")).plain == "S/ 299.97")
        #expect(formatAmount(dec("1000")).plain == "S/ 1,000.00")
        // Un subtotal puede pasar de numeric(10,2) sin dejar de ser un importe legible.
        #expect(formatAmount(dec("123456789.5")).plain == "S/ 123,456,789.50")
    }

    @Test("formatAmount rechaza negativos, tres decimales y magnitudes desmesuradas sin lanzar")
    func rejectsBadAmounts() {
        #expect(formatAmount(dec("-0.01")) == nil)
        #expect(formatAmount(dec("1.005")) == nil)
        #expect(formatAmount(dec("10000000000000")) == nil)
        #expect(formatAmount(.nan) == nil)
    }

    @Test("menuPriceOrNil exige numeric(10,2)")
    func menuPrice() {
        #expect(menuPriceOrNil(dec("12.5")) == dec("12.50"))
        #expect(menuPriceOrNil(dec("99999999.99")) == dec("99999999.99"))
        #expect(menuPriceOrNil(dec("100000000")) == nil)
        #expect(menuPriceOrNil(dec("1.234")) == nil)
        #expect(menuPriceOrNil(dec("-1")) == nil)
        #expect(menuPriceOrNil(.nan) == nil)
    }

    @Test("menuPriceOrNil rechaza un negativo con céntimos y tres decimales sin redondear (EVID-001)")
    func neverRounds() {
        #expect(menuPriceOrNil(dec("-1.00")) == nil)
        #expect(menuPriceOrNil(dec("1.005")) == nil)
        #expect(menuPriceOrNil(dec("1.01")).map(formatSoles).plain == "S/ 1.01")
    }

    @Test("el tope de importe sale de los límites de la bolsa y el máximo se muestra entero")
    func amountCeiling() {
        // 50 platos × 50 unidades × (plato + 20 opciones) a 99999999.99 cada uno.
        #expect(maxAmount == dec("5249999999475.00"))
        #expect(formatAmount(maxAmount).plain == "S/ 5,249,999,999,475.00")
        #expect(formatAmount(maxAmount + dec("0.01")) == nil)
    }

    @Test("parseMenuPrice lee el texto sin redondear ni aceptar lo que no es un precio de carta")
    func parsePrice() {
        #expect(parseMenuPrice("12.50") == dec("12.5"))
        #expect(parseMenuPrice("12.500") == dec("12.5"))
        #expect(parseMenuPrice("99999999.99") == dec("99999999.99"))
        for bad in ["abc", "", "1.005", "-1", "100000000", "1e2147483647", "NaN", "12,50", " 1", "1.", ".5",
                    "0.0000000000000000000000000000000000000001"] {
            #expect(parseMenuPrice(bad) == nil, "\(bad)")
        }
    }
}
