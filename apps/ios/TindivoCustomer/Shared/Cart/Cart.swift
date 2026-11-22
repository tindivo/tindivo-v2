import Foundation

enum CartError: Error, Sendable, Equatable {
    /// La cantidad de una línea quedó fuera de 1...`maxQuantity`: es un error de programación de quien llama.
    case invalidQuantity
    /// No se pudo escribir la bolsa en el teléfono (el texto «No se pudo guardar tu bolsa» lo pone la pantalla).
    case saveFailed
}

/// Una opción elegida, con su precio de carta en el momento de elegirla.
struct CartModifier: Sendable, Equatable {
    let optionId: String
    let groupName: String
    let optionName: String
    let price: Decimal
}

/// Un plato de la bolsa. Los precios son los de la carta cuando se añadió: sirven para enseñar el subtotal, nunca
/// para cobrar. El importe que vale lo calcula el servidor al cotizar y al crear el pedido.
struct CartLine: Sendable, Equatable {
    let itemId: String
    let name: String
    let basePrice: Decimal
    let modifiers: [CartModifier]
    let note: String?
    let quantity: Int
    let imageURL: String?

    /// Dos líneas con la misma firma son el mismo plato y se suman (igual que `lineSignature` de la web).
    var signature: String {
        [
            itemId.lowercased(),
            modifiers.map { $0.optionId.lowercased() }.sortedByUTF16().joined(separator: ","),
            (note ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
        ].joined(separator: "|")
    }

    /// La firma para COMPARAR: sus unidades UTF-16, como `String.equals` de Kotlin. `==` de `String` en Swift trata
    /// como iguales «é» compuesta y descompuesta; en Android (y en la web) son platos distintos.
    var signatureKey: [UInt16] { Array(signature.utf16) }

    /// Precio de una unidad: el del plato más el de cada opción. Exacto: sin `Double` ni redondeo (SW-8).
    var unitPrice: Decimal { modifiers.reduce(basePrice) { $0 + $1.price } }

    var total: Decimal { unitPrice * Decimal(quantity) }

    func with(quantity: Int) -> CartLine {
        CartLine(
            itemId: itemId, name: name, basePrice: basePrice, modifiers: modifiers, note: note, quantity: quantity,
            imageURL: imageURL
        )
    }
}

/// La bolsa: platos de un solo negocio. Inmutable; cada cambio devuelve otra.
struct Cart: Sendable, Equatable {
    let businessId: String
    let businessName: String
    let lines: [CartLine]

    var subtotal: Decimal { lines.reduce(Decimal.zero) { $0 + $1.total } }

    /// Unidades en total, para el botón de la bolsa.
    var count: Int { lines.reduce(0) { $0 + $1.quantity } }

    var isEmpty: Bool { lines.isEmpty }

    /// Cambia la cantidad de una línea, siempre dentro de 1...`maxQuantity`; para quitarla está `removingLine`.
    func settingQuantity(of signature: String, to quantity: Int) -> Cart {
        let clamped = min(max(quantity, 1), CartLimits.maxQuantity)
        let key = Array(signature.utf16)
        return Cart(
            businessId: businessId, businessName: businessName,
            lines: lines.map { $0.signatureKey == key ? $0.with(quantity: clamped) : $0 }
        )
    }

    func removingLine(_ signature: String) -> Cart {
        let key = Array(signature.utf16)
        return Cart(businessId: businessId, businessName: businessName, lines: lines.filter { $0.signatureKey != key })
    }

    /// La huella de la bolsa: negocio y, por plato, su firma y su cantidad (sin importar el orden). Los precios no
    /// entran: el servidor cobra con los suyos.
    func fingerprint() -> String {
        businessId.lowercased() + "#" + lines.map { "\($0.signature)*\($0.quantity)" }.sortedByUTF16().joined(separator: ";")
    }
}

enum AddResult: Sendable, Equatable {
    /// `capped`: la cantidad pedida no cabía y la línea se quedó en `maxQuantity`.
    case added(Cart, capped: Bool)
    /// La bolsa es de otro negocio: no se toca hasta que la persona elija empezar una nueva (`replacedWith`).
    case otherBusiness(currentBusinessName: String)
    /// La bolsa ya tiene `maxLines` platos distintos: el pedido no admite más. La bolsa no cambia.
    case full
}

/// Añade `line` a `cart` (o a una bolsa nueva si no hay ninguna). La misma firma suma cantidades y se queda con el
/// nombre y los precios de `line`, los más recientes de la carta; la suma no pasa de `maxQuantity`.
func addToCart(_ cart: Cart?, businessId: String, businessName: String, line: CartLine) throws(CartError) -> AddResult {
    try requireValidQuantity(line)
    guard let cart, !cart.isEmpty else {
        return .added(Cart(businessId: businessId, businessName: businessName, lines: [line]), capped: false)
    }
    guard cart.businessId.caseInsensitiveCompare(businessId) == .orderedSame else {
        return .otherBusiness(currentBusinessName: cart.businessName)
    }
    return merge(line, into: cart)
}

private func merge(_ line: CartLine, into cart: Cart) -> AddResult {
    guard let existing = cart.lines.firstIndex(where: { $0.signatureKey == line.signatureKey }) else {
        if cart.lines.count >= CartLimits.maxLines { return .full }
        return .added(
            Cart(businessId: cart.businessId, businessName: cart.businessName, lines: cart.lines + [line]),
            capped: false
        )
    }
    let wanted = cart.lines[existing].quantity + line.quantity
    var lines = cart.lines
    lines[existing] = line.with(quantity: min(wanted, CartLimits.maxQuantity))
    return .added(
        Cart(businessId: cart.businessId, businessName: cart.businessName, lines: lines),
        capped: wanted > CartLimits.maxQuantity
    )
}

/// Empieza una bolsa nueva con `line`, después de que la persona aceptó vaciar la del otro negocio.
func replacedWith(businessId: String, businessName: String, line: CartLine) throws(CartError) -> Cart {
    try requireValidQuantity(line)
    return Cart(businessId: businessId, businessName: businessName, lines: [line])
}

private func requireValidQuantity(_ line: CartLine) throws(CartError) {
    guard (1...CartLimits.maxQuantity).contains(line.quantity) else { throw .invalidQuantity }
}

/// La nota tal como se guarda y se envía: sin espacios en los bordes y `nil` si queda vacía.
func normalizeNote(_ raw: String) -> String? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : takeUTF16(trimmed, CartLimits.maxNoteLength)
}

/// Los primeros `limit` caracteres sin pasar de `limit` unidades UTF-16 (como cuenta `.max(140)` del contrato) y sin
/// partir un carácter por la mitad.
func takeUTF16(_ text: String, _ limit: Int) -> String {
    var result = ""
    var used = 0
    for character in text {
        used += character.utf16.count
        if used > limit { break }
        result.append(character)
    }
    return result
}

extension [String] {
    /// Orden por unidades UTF-16, el de `sorted()` de Kotlin: el de Swift (por escalares) difiere con caracteres
    /// fuera del plano básico.
    fileprivate func sortedByUTF16() -> [String] {
        sorted { $0.utf16.lexicographicallyPrecedes($1.utf16) }
    }
}
