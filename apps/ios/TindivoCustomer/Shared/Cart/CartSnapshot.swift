import Foundation

/// La versión del formato guardado en disco. Cualquier otra se descarta entera: no se migra a medias.
let cartSnapshotVersion = 1

/// La bolsa tal como se guarda en el teléfono (SW-9). Los importes van como CADENA: un número JSON pasaría por
/// `Double` al leerlo y perdería la exactitud de los céntimos. No lleva `reservation`: eso es del checkout.
struct CartSnapshot: Codable, Sendable, Equatable {
    var version = cartSnapshotVersion
    var businessId: String
    var businessName: String
    var lines: [CartLineSnapshot]
    /// `delivery` o `pickup`. Una bolsa guardada antes de que existiera el campo se lee como `delivery`.
    var method: String = DeliveryMethod.delivery.rawValue
}

struct CartLineSnapshot: Codable, Sendable, Equatable {
    var itemId: String
    var name: String
    var basePrice: String
    var modifiers: [CartModifierSnapshot]
    var note: String?
    var quantity: Int
    var imageURL: String?
}

struct CartModifierSnapshot: Codable, Sendable, Equatable {
    var optionId: String
    var groupName: String
    var optionName: String
    var price: String
}

// MARK: - Lectura estricta: el formato es exactamente el conocido (una clave de más es un archivo corrupto)

private struct AnyKey: CodingKey {
    let stringValue: String
    var intValue: Int? { nil }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
}

private func rejectUnknownKeys<Key: CodingKey & CaseIterable>(_ decoder: any Decoder, known: Key.Type) throws {
    let present = try decoder.container(keyedBy: AnyKey.self).allKeys
    let allowed = Set(Key.allCases.map(\.stringValue))
    if let extra = present.first(where: { !allowed.contains($0.stringValue) }) {
        throw DecodingError.dataCorrupted(.init(
            codingPath: decoder.codingPath, debugDescription: "Clave desconocida en la bolsa guardada: \(extra.stringValue)"
        ))
    }
}

extension CartSnapshot {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case version, businessId, businessName, lines, method
    }

    init(from decoder: any Decoder) throws {
        try rejectUnknownKeys(decoder, known: CodingKeys.self)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? cartSnapshotVersion
        businessId = try container.decode(String.self, forKey: .businessId)
        businessName = try container.decode(String.self, forKey: .businessName)
        lines = try container.decode([CartLineSnapshot].self, forKey: .lines)
        method = try container.decodeIfPresent(String.self, forKey: .method) ?? DeliveryMethod.delivery.rawValue
    }
}

extension CartLineSnapshot {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case itemId, name, basePrice, modifiers, note, quantity, imageURL
    }

    init(from decoder: any Decoder) throws {
        try rejectUnknownKeys(decoder, known: CodingKeys.self)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        itemId = try container.decode(String.self, forKey: .itemId)
        name = try container.decode(String.self, forKey: .name)
        basePrice = try container.decode(String.self, forKey: .basePrice)
        modifiers = try container.decode([CartModifierSnapshot].self, forKey: .modifiers)
        note = try container.decodeIfPresent(String.self, forKey: .note)
        quantity = try container.decode(Int.self, forKey: .quantity)
        imageURL = try container.decodeIfPresent(String.self, forKey: .imageURL)
    }
}

extension CartModifierSnapshot {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case optionId, groupName, optionName, price
    }

    init(from decoder: any Decoder) throws {
        try rejectUnknownKeys(decoder, known: CodingKeys.self)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        optionId = try container.decode(String.self, forKey: .optionId)
        groupName = try container.decode(String.self, forKey: .groupName)
        optionName = try container.decode(String.self, forKey: .optionName)
        price = try container.decode(String.self, forKey: .price)
    }
}

/// Lee y escribe la bolsa como JSON. Lo que no sea exactamente el formato conocido lanza: quien lee (el almacén) lo
/// trata como «sin bolsa».
enum CartSnapshotCodec {
    static func encode(_ snapshot: CartSnapshot) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(snapshot)
    }

    static func decode(_ data: Data) throws -> CartSnapshot {
        try JSONDecoder().decode(CartSnapshot.self, from: data)
    }
}

// MARK: - Cart <-> CartSnapshot

extension Cart {
    /// `nil` si la bolsa está vacía: una bolsa vacía se guarda como «sin bolsa».
    func snapshot() -> CartSnapshot? {
        guard !isEmpty else { return nil }
        return CartSnapshot(
            businessId: businessId,
            businessName: businessName,
            lines: lines.map { line in
                CartLineSnapshot(
                    itemId: line.itemId, name: line.name, basePrice: plainPrice(line.basePrice),
                    modifiers: line.modifiers.map {
                        CartModifierSnapshot(
                            optionId: $0.optionId, groupName: $0.groupName, optionName: $0.optionName,
                            price: plainPrice($0.price)
                        )
                    },
                    note: line.note, quantity: line.quantity, imageURL: line.imageURL
                )
            },
            method: method.rawValue
        )
    }

    /// La bolsa que representa `snapshot`, o `nil` si algo no cuadra. Falla cerrado: una versión distinta, un importe
    /// que no es un precio de carta, más platos, una cantidad, una lista de opciones o una nota fuera de los límites
    /// del pedido, una opción repetida en una línea, o dos líneas con la misma firma descartan la bolsa entera.
    /// Nunca se arregla a medias: lo que se enseñaría podría no ser lo que la persona eligió.
    init?(snapshot: CartSnapshot) {
        guard snapshot.version == cartSnapshotVersion, !snapshot.businessId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !snapshot.lines.isEmpty, snapshot.lines.count <= CartLimits.maxLines
        else { return nil }
        // Un método que esta versión no conoce no borra la bolsa: se lee como delivery, que es lo que se elige en el checkout.
        let method = DeliveryMethod(rawValue: snapshot.method) ?? .delivery
        var restored: [CartLine] = []
        for line in snapshot.lines {
            guard let restoredLine = CartLine(snapshot: line) else { return nil }
            restored.append(restoredLine)
        }
        guard Set(restored.map(\.signatureKey)).count == restored.count else { return nil }
        self.init(businessId: snapshot.businessId, businessName: snapshot.businessName, lines: restored, method: method)
    }
}

private extension CartLine {
    init?(snapshot: CartLineSnapshot) {
        guard (1...CartLimits.maxQuantity).contains(snapshot.quantity),
              snapshot.modifiers.count <= CartLimits.maxModifiers,
              (snapshot.note?.utf16.count ?? 0) <= CartLimits.maxNoteLength,
              // Una opción repetida es una selección que el pedido rechaza (`checkModifierSelection`, 0275): no se deduplica.
              Set(snapshot.modifiers.map { $0.optionId.lowercased() }).count == snapshot.modifiers.count,
              let base = parseMenuPrice(snapshot.basePrice)
        else { return nil }
        var modifiers: [CartModifier] = []
        for modifier in snapshot.modifiers {
            guard let price = parseMenuPrice(modifier.price) else { return nil }
            modifiers.append(CartModifier(
                optionId: modifier.optionId, groupName: modifier.groupName, optionName: modifier.optionName,
                price: price
            ))
        }
        self.init(
            itemId: snapshot.itemId, name: snapshot.name, basePrice: base, modifiers: modifiers,
            note: snapshot.note, quantity: snapshot.quantity, imageURL: snapshot.imageURL
        )
    }
}

/// `12.5` → `"12.50"`: el importe como texto con dos decimales, sin separador de miles y sin depender de la región.
private func plainPrice(_ amount: Decimal) -> String {
    amount.formatted(
        .number.precision(.fractionLength(2)).grouping(.never).locale(Locale(identifier: "en_US_POSIX"))
    )
}
