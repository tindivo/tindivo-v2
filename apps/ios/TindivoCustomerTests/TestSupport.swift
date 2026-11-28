import Foundation

/// Un instante a partir de una fecha y hora de Lima (UTC-5 fijo): `at("2026-07-07", "20:00")`.
func at(_ date: String, _ time: String) -> Date {
    ISO8601DateFormatter().date(from: "\(date)T\(time):00-05:00") ?? .distantPast
}

/// Un importe exacto a partir de su texto, como lo escribe la API.
func dec(_ text: String) -> Decimal {
    Decimal(string: text, locale: Locale(identifier: "en_US_POSIX")) ?? .nan
}

extension String {
    /// `Money.format` escribe un espacio duro tras `S/`: en las pruebas se compara con uno normal.
    var plain: String { replacingOccurrences(of: "\u{00A0}", with: " ") }
}

extension Optional where Wrapped == String {
    var plain: String? { map { $0.plain } }
}
