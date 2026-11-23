import Foundation
import TindivoAPI

/// Un día de la hoja «Información»: su nombre, sus turnos («18:00 – 23:00») y si es hoy. Sin turnos es «Cerrado».
struct WeekScheduleRow: Sendable, Equatable, Identifiable {
    let dayIndex: Int
    let name: String
    let shifts: [String]
    let isToday: Bool

    var id: Int { dayIndex }
    var isClosed: Bool { shifts.isEmpty }
}

/// Los siete días, de lunes a domingo, con «hoy» según la hora de Lima (CUS-CAT-021). Un día sin fila, cerrado o con
/// turnos ilegibles sale sin turnos, o sea «Cerrado». La regla de si está abierto AHORA es `openStatus`; esto solo
/// reparte el horario que manda la carta.
func weekSchedule(days: [ScheduleDay], now: Date) -> [WeekScheduleRow] {
    let byDay = Dictionary(days.map { ($0.dayOfWeek, $0) }, uniquingKeysWith: { _, last in last })
    let today = LimaClock.dayIndex(now)
    return (0..<LimaClock.weekDays).map { index in
        WeekScheduleRow(
            dayIndex: index, name: LimaClock.dayName(index), shifts: shiftLabels(of: byDay[index]), isToday: index == today
        )
    }
}

private func shiftLabels(of row: ScheduleDay?) -> [String] {
    guard let row, row.isOpen else { return [] }
    return [(row.shift1Start, row.shift1End), (row.shift2Start, row.shift2End)].compactMap { from, to in
        guard let start = LimaClock.clockLabel(from), let end = LimaClock.clockLabel(to) else { return nil }
        return "\(start) – \(end)"
    }
}

/// Cómo recibe el cliente el pedido, solo como información: el método se elige en el checkout (CUS-CRT-007).
enum DeliveryMode: Sendable, Equatable {
    /// `eta` es el plazo («25–40 min»); el costo de envío no viene en la carta pública, así que no se muestra.
    case delivery(eta: String?)
    case pickup
}

extension DeliveryMode {
    /// «Delivery · 25–40 min» / «Recojo · En el local»: el texto de la fila informativa de la página del negocio.
    var summary: String {
        switch self {
        case let .delivery(eta): eta.map { String(localized: "Delivery · \($0)") } ?? String(localized: "Delivery")
        case .pickup: String(localized: "Recojo · En el local")
        }
    }
}

/// Los modos que acepta el negocio según su capacidad principal (CUS-CAT-017). Modo catálogo y capacidades que esta
/// versión no conoce no ofrecen ninguno: no se inventa lo que el servidor no dijo.
func deliveryModes(capability: PrimaryCapability?, etaMin: Int?, etaMax: Int?) -> [DeliveryMode] {
    let eta = both(etaMin, etaMax).map { String(localized: "\($0)–\($1) min") }
    switch capability {
    case .catalogFull: return [.delivery(eta: eta), .pickup]
    case .catalogDelivery: return [.delivery(eta: eta)]
    case .catalogPickup, .pickupLocal: return [.pickup]
    case .driversOnly, .catalogOnly, .unknown, nil: return []
    }
}

/// Lo que muestra la hoja «Información» (CUS-CAT-027): sin contacto (CUS-CAT-026).
struct BusinessInfo: Sendable, Equatable {
    let name: String
    let modes: [DeliveryMode]
    let week: [WeekScheduleRow]
    /// «Abierto · cierra 23:00» / «Cerrado · abre hoy 18:00»; `nil` sin horario o en modo catálogo.
    let status: String?
}

private func both(_ a: Int?, _ b: Int?) -> (Int, Int)? {
    guard let a, let b else { return nil }
    return (a, b)
}
