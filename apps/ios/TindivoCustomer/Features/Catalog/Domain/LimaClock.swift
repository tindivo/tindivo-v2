import Foundation

/// La hora de Lima (`America/Lima`, UTC-5 sin horario de verano): la que cuenta para los horarios del negocio y las
/// franjas de los platos, nunca la zona del dispositivo. El reloj se inyecta: las reglas reciben el `Date` de "ahora".
enum LimaClock {
    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Lima") ?? TimeZone(secondsFromGMT: -5 * 3600) ?? .gmt
        return calendar
    }()

    static let weekDays = 7
    static let hourMinutes = 60
    static let dayMinutes = 24 * hourMinutes

    /// 0 = lunes … 6 = domingo, como `day_of_week` del servidor.
    static func dayIndex(_ now: Date) -> Int {
        (calendar.component(.weekday, from: now) + 5) % weekDays
    }

    /// Minutos desde la medianoche de Lima.
    static func minutes(_ now: Date) -> Int {
        calendar.component(.hour, from: now) * hourMinutes + calendar.component(.minute, from: now)
    }

    /// Minutos desde medianoche de `HH:MM` o `HH:MM:SS`; `nil` si no se puede leer.
    static func parseMinutes(_ value: String?) -> Int? {
        guard let match = value?.wholeMatch(of: /(\d{2}):(\d{2})(?::\d{2})?/),
            let hour = Int(match.1), let minute = Int(match.2), hour <= 23, minute <= 59
        else { return nil }
        return hour * hourMinutes + minute
    }

    /// «lun» … «dom» (0 = lunes).
    static func dayLabel(_ index: Int) -> String {
        switch index {
        case 0: String(localized: "lun")
        case 1: String(localized: "mar")
        case 2: String(localized: "mié")
        case 3: String(localized: "jue")
        case 4: String(localized: "vie")
        case 5: String(localized: "sáb")
        default: String(localized: "dom")
        }
    }

    /// «Lunes» … «Domingo» (0 = lunes), para la lista del horario semanal.
    static func dayName(_ index: Int) -> String {
        switch index {
        case 0: String(localized: "Lunes")
        case 1: String(localized: "Martes")
        case 2: String(localized: "Miércoles")
        case 3: String(localized: "Jueves")
        case 4: String(localized: "Viernes")
        case 5: String(localized: "Sábado")
        default: String(localized: "Domingo")
        }
    }

    /// `HH:MM` desde `HH:MM` o `HH:MM:SS`; `nil` si no se puede leer.
    static func clockLabel(_ value: String?) -> String? {
        parseMinutes(value).map { String(format: "%02d:%02d", $0 / hourMinutes, $0 % hourMinutes) }
    }
}
