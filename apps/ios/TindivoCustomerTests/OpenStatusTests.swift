import Foundation
import Testing
@testable import TindivoCustomer

/// Los casos de `OpenStatusTest.kt` (y de `getOpenStatus`). Lima = UTC-5. Lunes 2026-07-06.
@Suite("Estado de apertura del negocio")
struct OpenStatusTests {
    private func day(_ dow: Int, _ s1: (String, String)? = nil, _ s2: (String, String)? = nil) -> ScheduleDay {
        ScheduleDay(
            dayOfWeek: dow, isOpen: s1 != nil,
            shift1Start: s1?.0, shift1End: s1?.1, shift2Start: s2?.0, shift2End: s2?.1
        )
    }

    // La Florencia: de martes a sábado, 18:00-23:00; el sábado también 11:00-15:00.
    private var week: [ScheduleDay] {
        [
            day(0),
            day(1, ("18:00", "23:00")), day(2, ("18:00", "23:00")), day(3, ("18:00", "23:00")),
            day(4, ("18:00", "23:00")), day(5, ("11:00", "15:00"), ("18:00", "23:00")),
            day(6),
        ]
    }

    private func closed(_ opensAt: String?, _ daysAhead: Int, notConfirmed: Bool = false) -> OpenStatus {
        .closed(ClosedStatus(opensAt: opensAt, daysAhead: daysAhead, notConfirmed: notConfirmed))
    }

    @Test("CA-CAT-03 un negocio cerrado dice cuándo abre hoy")
    func opensToday() {
        let status = openStatus(days: week, now: at("2026-07-07", "12:00"), openingConfirmed: nil)
        #expect(status == closed("18:00", 0))
        #expect(!status.allowsOrders)
    }

    @Test("CA-CAT-03 cerrado el domingo abre el martes, dos días después")
    func opensTuesday() {
        #expect(openStatus(days: week, now: at("2026-07-12", "12:00"), openingConfirmed: nil) == closed("18:00", 2))
    }

    @Test("dentro del turno está abierto y dice cuándo cierra")
    func open() {
        #expect(openStatus(days: week, now: at("2026-07-07", "20:00"), openingConfirmed: nil) == .open(closesAt: "23:00"))
    }

    @Test("el cierre del turno no entra y la apertura sí")
    func edges() {
        #expect(openStatus(days: week, now: at("2026-07-07", "18:00"), openingConfirmed: nil) == .open(closesAt: "23:00"))
        #expect(openStatus(days: week, now: at("2026-07-07", "23:00"), openingConfirmed: nil) == closed("18:00", 1))
    }

    @Test("el sábado entre sus dos turnos está cerrado hasta el de la noche")
    func betweenShifts() {
        #expect(openStatus(days: week, now: at("2026-07-11", "16:00"), openingConfirmed: nil) == closed("18:00", 0))
    }

    @Test("un turno que cruza medianoche cubre la madrugada del día siguiente")
    func overnight() {
        let noche = [day(5, ("22:00", "02:00")), day(6)]
        #expect(openStatus(days: noche, now: at("2026-07-12", "01:00"), openingConfirmed: nil) == .open(closesAt: "02:00"))
        let atTwo = openStatus(days: noche, now: at("2026-07-12", "02:00"), openingConfirmed: nil)
        if case .closed = atTwo {} else { Issue.record("a las 02:00 debía estar cerrado: \(atTwo)") }
    }

    @Test("sin horario se trata como siempre abierto")
    func noSchedule() {
        let status = openStatus(days: [], now: at("2026-07-07", "03:00"), openingConfirmed: false)
        #expect(status == .noSchedule)
        #expect(status.allowsOrders)
    }

    @Test("dentro del horario pero sin confirmar la jornada está cerrado")
    func notConfirmed() {
        let now = at("2026-07-07", "20:00")
        #expect(openStatus(days: week, now: now, openingConfirmed: false) == closed(nil, 0, notConfirmed: true))
        #expect(openStatus(days: week, now: now, openingConfirmed: nil) == .open(closesAt: "23:00"))
        #expect(openStatus(days: week, now: now, openingConfirmed: true) == .open(closesAt: "23:00"))
    }

    @Test("con el horario roto no hay próxima apertura y no se cuelga")
    func brokenSchedule() {
        let broken = [ScheduleDay(dayOfWeek: 1, isOpen: true, shift1Start: "tarde", shift1End: "noche")]
        #expect(openStatus(days: broken, now: at("2026-07-07", "12:00"), openingConfirmed: nil) == closed(nil, 0))
    }
}
