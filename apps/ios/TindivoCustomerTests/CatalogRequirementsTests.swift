import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// Los requisitos del catálogo que no vivían en ninguna prueba: horario semanal, modos de entrega, textos de estado,
/// plurales, etiquetas y «Desde». El ID del requisito va en el nombre de cada prueba.
@Suite("Catálogo: horario, estados y textos")
struct CatalogRequirementsTests {
    private func day(_ dow: Int, _ s1: (String, String)? = nil, _ s2: (String, String)? = nil) -> ScheduleDay {
        ScheduleDay(
            dayOfWeek: dow, isOpen: s1 != nil,
            shift1Start: s1?.0, shift1End: s1?.1, shift2Start: s2?.0, shift2End: s2?.1
        )
    }

    /// Martes a sábado de 18:00 a 23:00; el sábado también de 11:00 a 15:00; lunes y domingo sin turno.
    private var week: [ScheduleDay] {
        [
            day(0),
            day(1, ("18:00", "23:00")), day(2, ("18:00:00", "23:00:00")), day(3, ("18:00", "23:00")),
            day(4, ("18:00", "23:00")), day(5, ("11:00", "15:00"), ("18:00", "23:00")),
        ]
    }

    // MARK: Horario semanal (CUS-CAT-021, CA-CAT-P6)

    @Test("CA-CAT-P6 la hoja lista los siete días de lunes a domingo, con hoy marcado y «Cerrado» sin turno")
    func weekHasSevenDays() {
        let rows = weekSchedule(days: week, now: at("2026-07-07", "20:00"))
        #expect(rows.map(\.name) == ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"])
        #expect(rows.filter(\.isToday).map(\.name) == ["Martes"])
        #expect(rows[0].isClosed)
        #expect(rows[6].isClosed)
        #expect(rows[1].shifts == ["18:00 – 23:00"])
        #expect(rows[2].shifts == ["18:00 – 23:00"], "los segundos del servidor no se muestran")
        #expect(rows[5].shifts == ["11:00 – 15:00", "18:00 – 23:00"])
    }

    @Test("CA-CAT-P6 hoy es el de Lima, no el del dispositivo: a las 23:30 de Lima del domingo ya es otro día en UTC")
    func todayIsLima() {
        let rows = weekSchedule(days: week, now: at("2026-07-12", "23:30"))
        #expect(rows.filter(\.isToday).map(\.name) == ["Domingo"])
    }

    @Test("CUS-CAT-021 sin horario todos los días dicen «Cerrado»; un turno ilegible tampoco inventa horas")
    func weekWithoutSchedule() {
        #expect(weekSchedule(days: [], now: at("2026-07-07", "12:00")).allSatisfy { $0.isClosed })
        let broken = weekSchedule(days: [day(1, ("xx", "23:00"))], now: at("2026-07-07", "12:00"))
        #expect(broken[1].isClosed)
    }

    // MARK: Modos de entrega (CUS-CAT-017)

    @Test("CUS-CAT-017 los modos de entrega salen de la capacidad, solo como información")
    func deliveryModesByCapability() {
        let eta = "25–40 min"
        #expect(deliveryModes(capability: .catalogFull, etaMin: 25, etaMax: 40) == [.delivery(eta: eta), .pickup])
        #expect(deliveryModes(capability: .catalogDelivery, etaMin: 25, etaMax: 40) == [.delivery(eta: eta)])
        #expect(deliveryModes(capability: .catalogPickup, etaMin: 25, etaMax: 40) == [.pickup])
        #expect(deliveryModes(capability: .pickupLocal, etaMin: nil, etaMax: nil) == [.pickup])
    }

    @Test("CUS-CAT-017 modo catálogo, capacidad desconocida o ausente no ofrecen ningún modo ni inventan el envío")
    func noModes() {
        #expect(deliveryModes(capability: .catalogOnly, etaMin: 1, etaMax: 2).isEmpty)
        #expect(deliveryModes(capability: .unknown("nueva"), etaMin: 1, etaMax: 2).isEmpty)
        #expect(deliveryModes(capability: nil, etaMin: 1, etaMax: 2).isEmpty)
        #expect(deliveryModes(capability: .catalogDelivery, etaMin: nil, etaMax: nil) == [.delivery(eta: nil)])
    }

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
