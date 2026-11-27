import Foundation
import TindivoAPI

/// Lo que admite `POST /customer/orders` (`packages/contracts/src/cart.ts`): los mismos topes que en Android.
enum CartLimits {
    static let maxLines = 50
    static let maxQuantity = 50
    static let maxNoteLength = 140
    static let maxModifiers = 20
}

/// `numeric(10,2)`: dos decimales y diez cifras en total, como `menu_items.base_price` y `additional_price`.
let maxMenuPrice = Decimal(sign: .plus, exponent: -2, significand: 9_999_999_999)

/// El mayor importe que puede sumar una bolsa admitida: `maxLines` platos de `maxQuantity` unidades, cada una con el
/// precio máximo de carta en el plato y en sus `maxModifiers` opciones (`5249999999475.00`).
let maxAmount: Decimal =
    maxMenuPrice
    * Decimal(CartLimits.maxModifiers + 1) * Decimal(CartLimits.maxQuantity) * Decimal(CartLimits.maxLines)

/// El precio de carta `amount` con exactamente dos decimales, o `nil` si no se puede mostrar tal cual: negativo, más
/// de ocho cifras enteras o más de dos decimales. Nunca redondea.
func menuPriceOrNil(_ amount: Decimal) -> Decimal? {
    guard amount.isFinite, amount >= 0, amount <= maxMenuPrice else { return nil }
    return exactCents(amount)
}

/// Un importe calculado (un subtotal, el total de una línea) listo para mostrar: `S/ 299.97`. Solo para mostrar:
/// nunca se usa para calcular. A diferencia de un precio de carta no tiene el tope de `numeric(10,2)`, pero sigue sin
/// redondear: `nil` si es negativo, pasa de `maxAmount` o tiene más de dos decimales.
func formatAmount(_ amount: Decimal) -> String? {
    guard amount.isFinite, amount >= 0, amount <= maxAmount else { return nil }
    return exactCents(amount).map(formatSoles)
}

/// Lo que se enseña cuando un importe calculado no se puede mostrar. Un importe que `formatAmount` rechaza
/// es un dato roto: nunca se «arregla» enseñándolo de otra forma.
let invalidAmountText = "—"

/// Lo que VoiceOver lee en lugar de «—»: una raya sola no dice nada.
var invalidAmountSpokenText: String { String(localized: "Precio no disponible") }

/// `text` tal como se lee en voz alta: cada «—» pasa a «Precio no disponible» (CA-CRT-15). Solo para la accesibilidad.
func spokenAmountText(_ text: String) -> String {
    text.contains(invalidAmountText)
        ? text.replacingOccurrences(of: invalidAmountText, with: invalidAmountSpokenText) : text
}

/// `formatAmount`, o «—» si el importe es un dato roto. No cambia ningún cálculo: solo lo que se muestra.
func displayAmount(_ amount: Decimal) -> String {
    formatAmount(amount) ?? invalidAmountText
}

/// `S/ 12.50` en soles de Perú (SW-8).
func formatSoles(_ exact: Decimal) -> String {
    Money.format(exact)
}

/// Un precio de carta guardado como texto (la bolsa en disco): `nil` si no es un decimal sin signo, si tiene más de
/// ocho cifras enteras o más de dos decimales significativos. Se mira el TEXTO antes de crear el `Decimal`, porque
/// `Decimal(string:)` recorta en silencio lo que no le cabe (un 1.000…0001 de 40 decimales saldría como 1).
func parseMenuPrice(_ text: String) -> Decimal? {
    guard let match = text.wholeMatch(of: /(\d+)(?:\.(\d+))?/) else { return nil }
    let whole = String(match.1).drop { $0 == "0" }
    var fraction = Substring(match.2 ?? "")
    while fraction.last == "0" { fraction = fraction.dropLast() }
    guard whole.count <= 8, fraction.count <= 2 else { return nil }
    let clean = "\(whole.isEmpty ? "0" : String(whole)).\(fraction.isEmpty ? "0" : String(fraction))"
    return Decimal(string: clean, locale: Locale(identifier: "en_US_POSIX")).flatMap(menuPriceOrNil)
}

private func exactCents(_ amount: Decimal) -> Decimal? {
    var input = amount
    var rounded = Decimal()
    NSDecimalRound(&rounded, &input, 2, .plain)
    return rounded == amount ? rounded : nil
}
