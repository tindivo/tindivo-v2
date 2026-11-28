import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// Los requisitos del catálogo que no vivían en ninguna prueba: textos de estado, plurales, etiquetas y «Desde». El ID
/// del requisito va en el nombre de cada prueba.
@Suite("Catálogo: estados y textos")
struct CatalogRequirementsTests {
    // MARK: Estado de apertura en texto (CA-CAT-P2, CA-CAT-P5)

    @Test("CA-CAT-P2 «Cerrado · abre [día] [hora]»: hoy, mañana o el día de la semana")
    func closedSummaryDays() {
        let now = at("2026-07-12", "12:00")  // domingo
        #expect(closedSummary(ClosedStatus(opensAt: "18:00", daysAhead: 0), now: now) == "Cerrado · abre hoy 18:00")
        #expect(closedSummary(ClosedStatus(opensAt: "18:00", daysAhead: 1), now: now) == "Cerrado · abre mañana 18:00")
        #expect(closedSummary(ClosedStatus(opensAt: "18:00:00", daysAhead: 2), now: now) == "Cerrado · abre mar 18:00")
    }

    @Test("CA-CAT-P2 sin saber cuándo abre, o sin confirmar la jornada, dice «Cerrado ahora»")
    func closedSummaryUnknown() {
        let now = at("2026-07-12", "12:00")
        #expect(closedSummary(ClosedStatus(opensAt: nil, daysAhead: 0), now: now) == "Cerrado ahora")
        #expect(
            closedSummary(ClosedStatus(opensAt: nil, daysAhead: 0, notConfirmed: true), now: now) == "Cerrado ahora")
    }

    @Test("CA-CAT-P5 la barra dice «Abierto · cierra [hora]»; sin horario no dice nada")
    func statusLines() {
        let now = at("2026-07-07", "20:00")
        #expect(openStatusLine(.open(closesAt: "23:00"), now: now) == "Abierto · cierra 23:00")
        #expect(openStatusLine(.noSchedule, now: now) == nil)
        #expect(
            openStatusLine(.closed(ClosedStatus(opensAt: "18:00", daysAhead: 1)), now: now)
                == "Cerrado · abre mañana 18:00")
    }

    // MARK: Modo catálogo (A10: los enlaces salen del modelo)

    @Test("CUS-CAT-015 los enlaces de WhatsApp y llamada salen del número, y sin número no hay barra")
    func contactLinks() {
        let links = OrderingMode.contact(whatsappNumber: "+51 987-654-321").contactLinks
        #expect(links?.whatsapp?.absoluteString == "https://wa.me/51987654321")
        #expect(links?.tel?.absoluteString == "tel:+51987654321")
        #expect(OrderingMode.contact(whatsappNumber: nil).contactLinks == nil)
        #expect(OrderingMode.contact(whatsappNumber: "sin número").contactLinks == nil)
        #expect(OrderingMode.open.contactLinks == nil)
    }

    // MARK: Plurales del catálogo de cadenas (M1)

    @Test("M1 el plural sale del catálogo: 1 unidad, 2 unidades; 1 plato, 12 platos")
    func plurals() {
        #expect(unitsText(1) == "1 unidad")
        #expect(unitsText(3) == "3 unidades")
        #expect(dishesText(1) == "1 plato")
        #expect(dishesText(12) == "12 platos")
    }
}

/// CUS-CAT-007 y «Desde S/»: lo que el mapeo de la carta le añade al plato.
@Suite("Catálogo: etiquetas y precio «Desde»")
struct DishExtrasMappingTests {
    private func mapped(_ raw: BusinessMenu.Item) throws -> MenuItem {
        let detail = try #require(MenuMapping.detail(from: Fixture.menu([Fixture.category("c", [raw])])))
        return try #require(detail.categories.first?.items.first)
    }

    @Test("CUS-CAT-007 las etiquetas del plato llegan a la ficha, sin las vacías")
    func badges() throws {
        let raw = BusinessMenu.Item(
            id: "i1", name: "Pollo", basePrice: dec("10"), displayOrder: 1, badges: ["Nuevo", "  ", "Picante"]
        )
        #expect(try mapped(raw).badges == ["Nuevo", "Picante"])
        #expect(try mapped(Fixture.item("i2")).badges.isEmpty)
    }

    @Test("CUS-CAT-029 «Desde S/»: base más lo más barato de cada grupo obligatorio; sin obligatorios, nada")
    func startingAt() throws {
        let raw = Fixture.item(
            "i1", price: "10",
            groups: [
                Fixture.group(
                    "g1", single: true, required: true, min: 1, max: 1,
                    options: [Fixture.option("a", "3"), Fixture.option("b", "1.50")]),
                Fixture.group(
                    "g2", required: true, min: 2, max: 3,
                    options: [Fixture.option("c", "1"), Fixture.option("d", "2"), Fixture.option("e", "4")]),
                Fixture.group("g3", options: [Fixture.option("f", "0.50")]),
            ])
        // 10 + 1.50 + (1 + 2)
        #expect(try mapped(raw).startingAtText.plain == "S/ 14.50")
        let optionalOnly = Fixture.item("i2", groups: [Fixture.group("g", options: [Fixture.option("o", "1")])])
        #expect(try mapped(optionalOnly).startingAtText == nil)
        #expect(try mapped(optionalOnly).isConfigurable)
        #expect(try !mapped(Fixture.item("i3")).isConfigurable)
    }
}
