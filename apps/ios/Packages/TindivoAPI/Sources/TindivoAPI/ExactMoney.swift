import Foundation

/// Dinero heredado: un número JSON que sale de un `numeric(10,2)` (`legacyMoney` del contrato; los campos nuevos
/// viajan como texto, D-39, y se leen con `Money.parse`). El generador lo usaría como `Double`; este tipo lo
/// sustituye (`typeOverrides` en `openapi-generator-config.yaml`) para que llegue como `Decimal` exacto (SW-8).
///
/// Por qué se redondea al leer: el `JSONDecoder` de iOS 27 lee el número exacto (medido el 2026-11-22: 285 715
/// importes, cero diferencias), pero el de versiones anteriores pasaba por `Double` (3.3 → 3.29999…). Un
/// `numeric(10,2)` tiene a lo sumo 2 decimales y 10 cifras, y el error de `Double` en ese rango es de ~1e-8: redondear a
/// céntimos recupera el valor exacto en cualquier versión. Un número con un tercer decimal de verdad (12.345) no cabe
/// en el contrato: no se redondea a escondidas, se rechaza.
public struct ExactMoney: Codable, Hashable, Sendable {
    public let value: Decimal

    public init(_ value: Decimal) {
        self.value = value
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(Decimal.self)
        guard let cents = Self.exactCents(raw) else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Importe con más de 2 decimales: \(raw)"
            )
        }
        value = cents
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }

    /// El importe a céntimos si de verdad tiene a lo sumo 2 decimales (tolerando el error de `Double`); si no, nil.
    static func exactCents(_ raw: Decimal) -> Decimal? {
        var input = raw
        var rounded = Decimal()
        NSDecimalRound(&rounded, &input, 2, .plain)
        let drift = (raw - rounded).magnitude
        return drift < Decimal(string: "0.000001", locale: Locale(identifier: "en_US_POSIX"))! ? rounded : nil
    }
}
