import Foundation
import Testing
@testable import TindivoCustomer

/// Qué permite hacer el negocio con su carta ahora: pedir, solo mirar (cerrado) o contactar (modo catálogo).
@Suite("Modo de pedido del negocio")
struct OrderingModeTests {
    private func shift(_ dow: Int) -> ScheduleDay {
        ScheduleDay(dayOfWeek: dow, isOpen: true, shift1Start: "18:00", shift1End: "23:00")
    }

    private func business(
        catalogOnly: Bool = false,
        whatsapp: String? = nil,
        confirmed: Bool? = nil,
        days: [Int] = [1, 2, 3, 4, 5]
    ) -> BusinessDetail {
        BusinessDetail(
            id: "x", name: "La Florencia", tagline: nil, logoURL: nil, bannerURL: nil, accent: nil,
            categories: [], featured: nil, schedule: days.map(shift), openingConfirmed: confirmed,
            catalogOnly: catalogOnly, whatsappNumber: whatsapp
        )
    }

    @Test("CA-CAT-03 cerrado la carta se ve, no se agrega y dice cuándo abre")
    func closedToday() {
        // Martes 2026-07-07, 12:00 en Lima: abre hoy a las 18:00.
        let mode = orderingMode(for: business(), now: at("2026-07-07", "12:00"))
        guard case let .closed(status, _) = mode else {
            Issue.record("se esperaba .closed: \(mode)")
            return
        }
        #expect(status == ClosedStatus(opensAt: "18:00", daysAhead: 0))
        #expect(!mode.allowsBag)
        #expect(mode.closedDetail == "Abre hoy a las 18:00")
    }

    @Test("CA-CAT-03 el domingo cerrado dice el día en que abre")
    func closedSunday() {
        // Domingo 2026-07-12 a mediodía: abre el martes, dos días después.
        let mode = orderingMode(for: business(), now: at("2026-07-12", "12:00"))
        guard case let .closed(status, opensDay) = mode else {
            Issue.record("se esperaba .closed: \(mode)")
            return
        }
        #expect(opensDay == "mar")
        #expect(status.daysAhead == 2)
        #expect(mode.closedDetail == "Abre el mar a las 18:00")
    }

    @Test("los textos de un negocio cerrado: mañana, sin confirmar y sin próxima apertura")
    func closedTexts() {
        let tomorrow = OrderingMode.closed(ClosedStatus(opensAt: "18:00", daysAhead: 1), opensDay: "mié")
        #expect(tomorrow.closedDetail == "Abre mañana a las 18:00")
        let unconfirmed = OrderingMode.closed(ClosedStatus(opensAt: nil, daysAhead: 0, notConfirmed: true), opensDay: nil)
        #expect(unconfirmed.closedDetail == "Hoy este restaurante no ha confirmado que atiende")
        let none = OrderingMode.closed(ClosedStatus(opensAt: nil, daysAhead: 0), opensDay: nil)
        #expect(none.closedDetail == "Consulta su horario más tarde")
        #expect(OrderingMode.closedTitle == "Cerrado ahora")
        #expect(OrderingMode.open.closedDetail == nil)
    }

    @Test("abierto se puede pedir")
    func open() {
        let mode = orderingMode(for: business(), now: at("2026-07-07", "20:00"))
        #expect(mode == .open)
        #expect(mode.allowsBag)
    }

    @Test("CA-CAT-04 en modo catálogo se contacta aunque esté cerrado y no se agrega a la bolsa")
    func contact() {
        let mode = orderingMode(for: business(catalogOnly: true, whatsapp: "+51987654321"), now: at("2026-07-07", "03:00"))
        #expect(mode == .contact(whatsappNumber: "+51987654321"))
        #expect(!mode.allowsBag)
    }

    @Test("CA-CAT-03 tocar un plato abre la ficha solo si el negocio deja pedir")
    func dishTapNeedsBag() {
        #expect(OrderingMode.open.allowsBag)
        #expect(!OrderingMode.closed(ClosedStatus(opensAt: "18:00", daysAhead: 0), opensDay: nil).allowsBag)
        #expect(!OrderingMode.contact(whatsappNumber: "+51987654321").allowsBag)
    }

    @Test("CA-CAT-04 el enlace de WhatsApp y el de llamar salen del número")
    func contactLinks() {
        #expect(whatsappURI("+51 987 654 321") == "https://wa.me/51987654321")
        #expect(telURI("+51 987 654 321") == "tel:+51987654321")
        #expect(whatsappURI("sin numero") == nil)
        #expect(telURI("+") == nil)
    }
}
