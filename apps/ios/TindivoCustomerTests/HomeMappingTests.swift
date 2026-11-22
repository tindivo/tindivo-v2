import Foundation
import TindivoAPI
import Testing
@testable import TindivoCustomer

@Suite("Mapeo de la lista de Inicio")
struct HomeMappingTests {
    private func summary(
        _ id: String, capability: PrimaryCapability? = .catalogFull, open: Bool? = true, tagline: String? = "Pollo",
        accent: String = "F97316"
    ) -> BusinessSummary {
        BusinessSummary(
            id: id, slug: id, name: "N \(id)", accentColor: accent, tagline: tagline, primaryCapability: capability,
            estimatedEtaMin: 25, estimatedEtaMax: 40, isOpenNow: open
        )
    }

    @Test("los negocios de modo catálogo van a una sección aparte, en el orden del servidor")
    func partitions() {
        let listing = HomeMapping.listing(from: [
            summary("a"), summary("b", capability: .catalogOnly), summary("c", capability: nil),
            summary("d", capability: .unknown("nuevo")),
        ])
        #expect(listing.restaurants.map(\.id) == ["a", "c", "d"])
        #expect(listing.whatsapp.map(\.id) == ["b"])
    }

    @Test("solo isOpenNow == false cierra la tarjeta: null no la apaga")
    func closedOnlyWhenFalse() {
        let cards = HomeMapping.listing(from: [summary("a", open: false), summary("b", open: nil), summary("c")]).restaurants
        #expect(cards.map(\.closed) == [true, false, false])
    }

    @Test("la tarjeta lleva ETA, acento y un tagline en blanco se descarta")
    func card() {
        let card = HomeMapping.listing(from: [summary("a", tagline: "  ")]).restaurants[0]
        #expect(card.tagline == nil)
        #expect(card.etaMin == 25 && card.etaMax == 40)
        #expect(card.accent == 0xFFF97316)
    }

    @Test("parseAccent acepta con o sin # y exige seis dígitos hexadecimales")
    func accent() {
        #expect(parseAccent("F97316") == 0xFFF97316)
        #expect(parseAccent("#f97316") == 0xFFF97316)
        for bad in ["", "F9731", "F973166", "-12345", "ZZZZZZ", "+12345", nil] as [String?] {
            #expect(parseAccent(bad) == nil, "\(bad ?? "nil")")
        }
    }
}
