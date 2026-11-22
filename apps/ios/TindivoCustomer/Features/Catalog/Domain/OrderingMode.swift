import Foundation

/// Lo que el negocio permite hacer ahora con su carta (CUS-CAT-012, CUS-CAT-015).
enum OrderingMode: Sendable, Equatable {
    /// Se puede agregar a la bolsa y pedir.
    case open
    /// Cerrado, pausado o sin confirmar la jornada: la carta se ve, no se agrega. `opensDay` es «sáb»: el día de la
    /// próxima apertura, para cuando no es hoy ni mañana.
    case closed(ClosedStatus, opensDay: String?)
    /// Modo catálogo: se pide por WhatsApp o se llama; cierre y pausa no lo bloquean.
    case contact(whatsappNumber: String?)

    /// Tocar un plato abre su ficha solo si el negocio deja pedir; si no (cerrado o modo catálogo), nada.
    var allowsBag: Bool { self == .open }

    static var closedTitle: String { String(localized: "Cerrado ahora") }

    /// El aviso de un negocio cerrado: cuándo abre, o por qué no atiende hoy. `nil` si no está cerrado.
    var closedDetail: String? {
        guard case let .closed(status, opensDay) = self else { return nil }
        guard !status.notConfirmed else { return String(localized: "Hoy este restaurante no ha confirmado que atiende") }
        guard let opensAt = status.opensAt else { return String(localized: "Consulta su horario más tarde") }
        switch status.daysAhead {
        case 0: return String(localized: "Abre hoy a las \(opensAt)")
        case 1: return String(localized: "Abre mañana a las \(opensAt)")
        default:
            let day = opensDay ?? ""
            return String(localized: "Abre el \(day) a las \(opensAt)")
        }
    }
}

/// Catálogo primero (WhatsApp es el pedido y no lo cierra el horario); luego el horario del negocio.
func orderingMode(for business: BusinessDetail, now: Date) -> OrderingMode {
    if business.catalogOnly { return .contact(whatsappNumber: business.whatsappNumber) }
    guard case let .closed(status) = openStatus(
        days: business.schedule, now: now, openingConfirmed: business.openingConfirmed
    ) else { return .open }
    let day = LimaClock.dayLabel((LimaClock.dayIndex(now) + status.daysAhead) % LimaClock.weekDays)
    return .closed(status, opensDay: day)
}

/// `https://wa.me/51987654321` desde `+51987654321`; `nil` si no queda ningún dígito.
func whatsappURI(_ number: String) -> String? {
    let digits = number.filter(\.isASCIIDigit)
    return digits.isEmpty ? nil : "https://wa.me/\(digits)"
}

/// `tel:+51987654321`; `nil` si no queda ningún dígito.
func telURI(_ number: String) -> String? {
    let kept = number.filter { $0.isASCIIDigit || $0 == "+" }
    return kept.contains(where: \.isASCIIDigit) ? "tel:\(kept)" : nil
}

private extension Character {
    var isASCIIDigit: Bool { isASCII && isNumber }
}
