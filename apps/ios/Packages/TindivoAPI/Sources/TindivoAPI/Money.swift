import Foundation

/// Dinero (SW-8, API-8): en la API viaja como cadena decimal (`"12.50"`); en la app es `Decimal`, nunca `Double`.
public enum Money {
    private static let wire = Locale(identifier: "en_US_POSIX")
    private static let peru = Locale(identifier: "es_PE")

    /// `"12.50"` → `12.50`. Devuelve `nil` si la cadena no es un decimal completo (no acepta `"12,50"` ni `"12.5x"`).
    public static func parse(_ raw: String) -> Decimal? {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard trimmed.wholeMatch(of: /-?\d+(\.\d+)?/) != nil else { return nil }
        return Decimal(string: trimmed, locale: wire)
    }

    /// `12.5` → `"S/ 12.50"`, como lo escribe la región Perú del sistema.
    public static func format(_ amount: Decimal) -> String {
        amount.formatted(.currency(code: "PEN").locale(peru))
    }
}
