import Foundation

/// Lo que enseña la barra «Ver mi bolsa»: unidades y subtotal ya formateado.
struct CartBarSummary: Sendable, Equatable {
    let count: Int
    let subtotal: String
}

/// La barra de la bolsa de `businessId`, o `nil` si no hay bolsa o es de otro negocio. El subtotal es el de la carta:
/// se enseña, nunca se envía como importe.
func cartBar(for cart: Cart?, businessId: String) -> CartBarSummary? {
    guard let cart, !cart.isEmpty, cart.businessId.caseInsensitiveCompare(businessId) == .orderedSame else { return nil }
    return CartBarSummary(count: cart.count, subtotal: formatAmount(cart.subtotal) ?? formatSoles(cart.subtotal))
}

/// «3 unidades» / «1 unidad»: el plural lo decide el catálogo de cadenas (variaciones de plural).
func unitsText(_ count: Int) -> String {
    String(localized: "\(count) unidades")
}

/// «12 platos» / «1 plato».
func dishesText(_ count: Int) -> String {
    String(localized: "\(count) platos")
}
