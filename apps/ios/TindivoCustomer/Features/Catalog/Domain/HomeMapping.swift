import Foundation
import TindivoAPI

/// Lo que la tarjeta de un negocio necesita, ya decidido.
struct BusinessCard: Sendable, Equatable {
    let id: String
    let name: String
    let tagline: String?
    let logoURL: String?
    /// ARGB opaco; `nil` si el color del servidor no se pudo leer.
    let accent: UInt32?
    let closed: Bool
    let etaMin: Int
    let etaMax: Int
}

/// `restaurants` se piden por la plataforma; `whatsapp` (`catalog_only`) solo enseñan su carta y se piden por
/// WhatsApp, en una sección aparte, como en la web.
struct HomeListing: Sendable, Equatable {
    let restaurants: [BusinessCard]
    let whatsapp: [BusinessCard]
}

enum HomeMapping {
    static func listing(from businesses: [BusinessSummary]) -> HomeListing {
        let whatsapp = businesses.filter { $0.primaryCapability == .catalogOnly }
        let restaurants = businesses.filter { $0.primaryCapability != .catalogOnly }
        return HomeListing(restaurants: restaurants.map(card), whatsapp: whatsapp.map(card))
    }

    private static func card(_ business: BusinessSummary) -> BusinessCard {
        BusinessCard(
            id: business.id,
            name: business.name,
            tagline: nonBlank(business.tagline),
            logoURL: nonBlank(business.logoURL),
            accent: parseAccent(business.accentColor),
            // Solo `false` es cerrado: `nil` (el servidor no lo sabe) no apaga la tarjeta, igual que en la web.
            closed: business.isOpenNow == false,
            etaMin: business.estimatedEtaMin,
            etaMax: business.estimatedEtaMax
        )
    }
}

/// `businesses.accent_color` viaja sin `#` (CHECK `accent_color_format`, 0002), pero se acepta con él. Devuelve el
/// color opaco en ARGB, o `nil` si no son seis dígitos hexadecimales.
func parseAccent(_ hex: String?) -> UInt32? {
    guard var clean = hex?.trimmingCharacters(in: .whitespaces) else { return nil }
    if clean.hasPrefix("#") { clean.removeFirst() }
    guard clean.count == 6, clean.allSatisfy(\.isHexDigit), let rgb = UInt32(clean, radix: 16) else { return nil }
    return 0xFF00_0000 | rgb
}
