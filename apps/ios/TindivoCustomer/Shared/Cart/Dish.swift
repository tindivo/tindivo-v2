import Foundation

/// Una opción de un grupo del plato, con el precio de carta ya validado (`menuPriceOrNil`).
struct DishOption: Sendable, Equatable {
    let id: String
    let name: String
    let description: String?
    /// Suma al subtotal que se enseña; nunca se envía como importe.
    let price: Decimal
    /// El mismo precio listo para mostrar (`S/ 2.50`).
    let priceText: String
}

/// Un grupo de opciones del plato. `selectionType` y `priceDisplay` llegan como los sirve la carta.
struct DishGroup: Sendable, Equatable {
    /// El único `selectionType` con reglas propias; cualquier otro (incluso uno futuro) se trata como varias opciones.
    static let single = "single"

    let id: String
    let name: String
    let selectionType: String
    let isRequired: Bool
    let minSelections: Int
    let maxSelections: Int?
    /// `delta` (+ S/ x) o `total` (el precio final del plato); un valor nuevo se trata como `delta`.
    let priceDisplay: String
    let options: [DishOption]

    var isSingle: Bool { selectionType == Self.single }
}

/// Lo que la ficha del plato y la bolsa necesitan saber de un plato: nada de franja, descripción ni agotado.
/// Lo usan Negocio, Plato y Bolsa, por eso vive en lo compartido y no dentro de una feature.
struct Dish: Sendable, Equatable {
    let id: String
    let name: String
    /// El precio de carta con dos decimales: base del subtotal que se enseña, nunca un importe a cobrar.
    let basePrice: Decimal
    let imageURL: String?
    let groups: [DishGroup]
}
