import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// La sesión HTTP de la app, con los plazos de CLI-10 y sin seguir redirecciones (paridad con `TindivoHttp.kt`).
///
/// Plazos: 30 s sin recibir datos y 30 s como máximo por intento, y 30 s para la llamada completa con sus reintentos
/// (`callTimeout`, lo aplica `DeadlineMiddleware`). `URLSession` no tiene un plazo solo para conectar (CLI-10 pide
/// 10 s): la conexión cuenta dentro de esos 30 s. Desviación anotada en `apps/ios/AGENTS.md`.
public enum TindivoHTTP {
    public static let requestTimeout: TimeInterval = 30
    /// Plazo total de una llamada lógica, reintentos y esperas incluidos (el `callTimeout` de Android).
    public static let callTimeout: Duration = .seconds(30)

    public static func makeSession(protocolClasses: [AnyClass]? = nil) -> URLSession {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = requestTimeout
        configuration.timeoutIntervalForResource = requestTimeout
        configuration.waitsForConnectivity = false
        if let protocolClasses {
            configuration.protocolClasses = protocolClasses
        }
        return URLSession(configuration: configuration, delegate: NoRedirects(), delegateQueue: nil)
    }

    public static func makeTransport(session: URLSession = makeSession()) -> URLSessionTransport {
        URLSessionTransport(configuration: .init(session: session))
    }
}

/// Una redirección nunca se sigue: la respuesta 3xx llega tal cual y `ProblemMiddleware` la vuelve error. Así un
/// portal cautivo o un servidor mal configurado no se lleva la petición (con el token) a otro origen.
final class NoRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest
    ) async -> URLRequest? {
        nil
    }
}

/// Fechas del contrato (`format: date-time`): llegan con o sin fracción de segundo y con `Z` o con desfase
/// (`toISOString()` da milisegundos; Postgres, hasta microsegundos y `+00:00`). El transcodificador por defecto del
/// runtime solo acepta la forma sin fracción.
public struct FlexibleISO8601: DateTranscoder {
    public init() {}

    public func encode(_ date: Date) throws -> String {
        date.formatted(.iso8601.year().month().day().time(includingFractionalSeconds: true).timeZone(separator: .omitted))
    }

    public func decode(_ string: String) throws -> Date {
        let withFraction = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        let withoutFraction = Date.ISO8601FormatStyle()
        if let date = try? withFraction.parse(string) { return date }
        if let date = try? withoutFraction.parse(string) { return date }
        throw DecodingError.dataCorrupted(
            .init(codingPath: [], debugDescription: "Fecha ISO 8601 ilegible: \(string)")
        )
    }
}
