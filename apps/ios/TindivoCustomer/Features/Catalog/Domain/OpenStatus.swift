import Foundation
import TindivoAPI

/// Una fila de `business_schedule` tal como la manda la carta: `dayOfWeek` 0 = lunes … 6 = domingo.
typealias ScheduleDay = BusinessMenu.ScheduleDay

/// La próxima apertura de un negocio cerrado. `opensAt` es `HH:MM` o `nil` si no hay ninguna; `daysAhead` 0 = hoy,
/// 1 = mañana…; `notConfirmed`: el horario dice que abre pero nadie confirmó que hoy atiende.
struct ClosedStatus: Sendable, Equatable {
    let opensAt: String?
    let daysAhead: Int
    var notConfirmed = false
}

/// Si el negocio atiende ahora (CUS-CAT-012). Es el servidor quien rechaza un pedido; esto solo lo anticipa.
enum OpenStatus: Sendable, Equatable {
    /// Sin horario configurado: se trata como siempre abierto, sin avisos.
    case noSchedule
    case open(closesAt: String)
    case closed(ClosedStatus)

    var allowsOrders: Bool {
        if case .closed = self { return false }
        return true
    }
}

/// La misma regla que `getOpenStatus` de `packages/contracts/src/schedule.ts` (si cambia allí, cambia aquí y en sus
/// pruebas): días 0 = lunes, turno `[inicio, fin)`, el turno que cruza medianoche cubre la madrugada del día
/// siguiente, hora de Lima. `openingConfirmed == false` cierra un negocio que por horario estaría abierto; `nil` =
/// no se sabe y manda el horario.
func openStatus(days: [ScheduleDay], now: Date, openingConfirmed: Bool?) -> OpenStatus {
    if days.isEmpty { return .noSchedule }
    let byDay = Dictionary(days.map { ($0.dayOfWeek, $0) }, uniquingKeysWith: { _, last in last })
    let today = LimaClock.dayIndex(now)
    let minutes = LimaClock.minutes(now)

    // Un turno de AYER que cruza medianoche cubre la madrugada de hoy, aunque hoy esté cerrado.
    let yesterday = shifts(of: byDay[(today + LimaClock.weekDays - 1) % LimaClock.weekDays])
        .first { $0.crossesMidnight && minutes < $0.end }
    let current =
        yesterday
        ?? shifts(of: byDay[today]).first {
            minutes >= $0.start && minutes < ($0.crossesMidnight ? LimaClock.dayMinutes : $0.end)
        }
    if let current {
        return openingConfirmed == false
            ? .closed(ClosedStatus(opensAt: nil, daysAhead: 0, notConfirmed: true))
            : .open(closesAt: current.endLabel)
    }
    return .closed(nextOpening(byDay, today: today, minutes: minutes))
}

/// La próxima apertura: hoy, los turnos que aún no empiezan; si no, los días siguientes (hasta una semana).
private func nextOpening(_ byDay: [Int: ScheduleDay], today: Int, minutes: Int) -> ClosedStatus {
    for offset in 0...LimaClock.weekDays {
        let next = shifts(of: byDay[(today + offset) % LimaClock.weekDays])
            .filter { offset != 0 || $0.start > minutes }
            .min { $0.start < $1.start }
        if let next { return ClosedStatus(opensAt: next.startLabel, daysAhead: offset) }
    }
    return ClosedStatus(opensAt: nil, daysAhead: 0)
}

private struct Shift {
    let start: Int
    let end: Int
    let startLabel: String
    let endLabel: String

    var crossesMidnight: Bool { end <= start }
}

private func shifts(of row: ScheduleDay?) -> [Shift] {
    guard let row, row.isOpen else { return [] }
    return [(row.shift1Start, row.shift1End), (row.shift2Start, row.shift2End)].compactMap { from, to in
        guard let start = LimaClock.parseMinutes(from), let end = LimaClock.parseMinutes(to) else { return nil }
        return Shift(start: start, end: end, startLabel: from ?? "", endLabel: to ?? "")
    }
}
