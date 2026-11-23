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
        guard !status.notConfirmed else {
            return String(localized: "Hoy este restaurante no ha confirmado que atiende")
        }
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

/// Los enlaces de «Pedir por WhatsApp» y «Llamar» del modo catálogo; cada uno es `nil` si el número no da uno válido.
struct ContactLinks: Sendable, Equatable {
    let whatsapp: URL?
    let tel: URL?
}

extension OrderingMode {
    /// `nil` fuera del modo catálogo o sin número; también `nil` si ni WhatsApp ni teléfono salen del número.
    var contactLinks: ContactLinks? {
        guard case let .contact(number?) = self else { return nil }
        let links = ContactLinks(
            whatsapp: whatsappURI(number).flatMap(URL.init(string:)), tel: telURI(number).flatMap(URL.init(string:)))
        return links.whatsapp == nil && links.tel == nil ? nil : links
    }
}

/// «Cerrado · abre hoy 18:00», «… mañana 18:00» o «… sáb 18:00» (CA-CAT-P2); «Cerrado ahora» si no se sabe cuándo abre
/// o si hoy no atiende. Es el texto de la tarjeta del Inicio y de la barra de la carta.
func closedSummary(_ status: ClosedStatus, now: Date) -> String {
    guard !status.notConfirmed, let raw = status.opensAt else { return OrderingMode.closedTitle }
    let opensAt = LimaClock.clockLabel(raw) ?? raw
    switch status.daysAhead {
    case 0: return String(localized: "Cerrado · abre hoy \(opensAt)")
    case 1: return String(localized: "Cerrado · abre mañana \(opensAt)")
    default:
        let day = LimaClock.dayLabel((LimaClock.dayIndex(now) + status.daysAhead) % LimaClock.weekDays)
        return String(localized: "Cerrado · abre \(day) \(opensAt)")
    }
}

/// «Abierto · cierra 23:00» o el de cerrado; `nil` sin horario (se trata como abierto, sin avisos) (CA-CAT-P5).
func openStatusLine(_ status: OpenStatus, now: Date) -> String? {
    switch status {
    case .noSchedule: nil
    case let .open(closesAt): String(localized: "Abierto · cierra \(LimaClock.clockLabel(closesAt) ?? closesAt)")
    case let .closed(closed): closedSummary(closed, now: now)
    }
}

/// Catálogo primero (WhatsApp es el pedido y no lo cierra el horario); luego el horario del negocio.
func orderingMode(for business: BusinessDetail, now: Date) -> OrderingMode {
    if business.catalogOnly { return .contact(whatsappNumber: business.whatsappNumber) }
    guard
        case let .closed(status) = openStatus(
            days: business.schedule, now: now, openingConfirmed: business.openingConfirmed
        )
    else { return .open }
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
