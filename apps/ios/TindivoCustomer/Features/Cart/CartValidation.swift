import Foundation

/// Un problema de una línea de la bolsa frente a la carta vigente de su negocio (CUS-CRT-005). Son los mismos casos que
/// `validateCartAgainstCatalog` de la web (`apps/customer/lib/cart-validation.ts`).
enum CartLineIssue: Sendable, Equatable {
    /// El plato ya no está en la carta.
    case removed
    /// El negocio lo marcó agotado.
    case unavailable
    /// Hoy no es su franja; trae cuándo vuelve («Solo sáb y dom, de 11:00 a 15:00») si se puede decir.
    case outOfWindow(returns: String?)
    /// El precio de una unidad (plato más opciones) ya no es el de la bolsa; `delta` es lo que cambió (positivo, sube).
    case priceChanged(delta: Decimal)
    /// Una opción elegida cambió de precio.
    case optionPriceChanged(optionName: String)
    /// Una opción elegida ya no existe en el plato.
    case optionRemoved
    /// Lo elegido ya no cumple las reglas del plato (un grupo obligatorio nuevo, otro tope).
    case invalidSelection

    /// El aviso que se enseña en la línea.
    var message: String {
        switch self {
        case .removed: String(localized: "Este producto ya no está disponible")
        case .unavailable: String(localized: "Producto agotado por ahora")
        case let .outOfWindow(returns): returns ?? String(localized: "Fuera de su horario")
        case let .priceChanged(delta):
            delta >= 0
                ? String(localized: "Precio actualizado (+\(formatSoles(delta)))")
                : String(localized: "Precio actualizado (-\(formatSoles(-delta)))")
        case let .optionPriceChanged(name): String(localized: "La opción \"\(name)\" cambió de precio")
        case .optionRemoved: String(localized: "Una opción ya no está disponible")
        case .invalidSelection: String(localized: "El negocio cambió las opciones de este plato. Vuelve a elegirlas.")
        }
    }
}

enum CartValidation {
    /// Los problemas de cada línea de `cart` (en el mismo orden) frente a `detail` en el instante `now`; `[]` es una
    /// línea que se puede pedir. La bolsa no se toca: solo se avisa (CA-CRT-05).
    static func issues(of cart: Cart, against detail: BusinessDetail, now: Date) -> [[CartLineIssue]] {
        let items = Dictionary(
            detail.categories.flatMap(\.items).map { ($0.id.lowercased(), $0) }, uniquingKeysWith: { first, _ in first }
        )
        return cart.lines.map { issues(of: $0, item: items[$0.itemId.lowercased()], now: now) }
    }

    private static func issues(of line: CartLine, item: MenuItem?, now: Date) -> [CartLineIssue] {
        guard let item else { return [.removed] }
        var issues: [CartLineIssue] = []
        if !item.isAvailable { issues.append(.unavailable) }
        // Fuera de su franja (0226): existe, no se agotó y su precio no cambió, pero hoy no se cocina.
        if !item.window.isOpen(at: now) { issues.append(.outOfWindow(returns: item.window.describe())) }

        let options = Dictionary(
            item.dish.groups.flatMap(\.options).map { ($0.id.lowercased(), $0) }, uniquingKeysWith: { first, _ in first }
        )
        var expectedUnit = item.basePrice
        var chosenIds: [String] = []
        var missingOption = false
        for modifier in line.modifiers {
            guard let option = options[modifier.optionId.lowercased()] else {
                missingOption = true
                continue
            }
            chosenIds.append(option.id)
            expectedUnit += option.price
            if option.price != modifier.price { issues.append(.optionPriceChanged(optionName: option.name)) }
        }
        if missingOption {
            issues.append(.optionRemoved)
        } else {
            if expectedUnit != line.unitPrice { issues.append(.priceChanged(delta: expectedUnit - line.unitPrice)) }
            if !DishSelection(dish: item.dish, selectedIds: chosenIds).isValid { issues.append(.invalidSelection) }
        }
        return issues
    }
}
