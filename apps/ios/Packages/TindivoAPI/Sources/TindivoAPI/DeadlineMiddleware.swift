public import Foundation
public import HTTPTypes
package import OpenAPIRuntime

/// El plazo total de una llamada (CLI-10): 30 s para la petición lógica completa, con reintentos y esperas incluidos.
/// Es el `callTimeout` de `TindivoHttp.kt`: `URLSession` solo pone plazo a cada intento, y sin esto una llamada con
/// dos reintentos y un `Retry-After` de 10 s podía durar más de un minuto con la pantalla esperando.
///
/// Va primero en la cadena, por fuera de los reintentos. Al vencer cancela el trabajo de dentro (el intento en curso y
/// la espera del reintento) y devuelve `AppError.network`, que cubre «tiempo agotado». Si quien llama cancela, el error
/// es el de siempre (`.cancelled`), no un tiempo agotado.
package struct DeadlineMiddleware: ClientMiddleware {
    private let timeout: Duration
    private let sleep: @Sendable (Duration) async throws -> Void

    /// `sleep` solo se cambia en pruebas.
    package init(
        timeout: Duration = TindivoHTTP.callTimeout,
        sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
    ) {
        self.timeout = timeout
        self.sleep = sleep
    }

    private enum Outcome: Sendable {
        case finished(HTTPResponse, HTTPBody?)
        case timedOut
    }

    package func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let timeout = timeout
        let sleep = sleep
        return try await withoutActuallyEscaping(next) { call in
            try await withThrowingTaskGroup(of: Outcome.self) { group in
                group.addTask {
                    let (response, responseBody) = try await call(request, body, baseURL)
                    return .finished(response, responseBody)
                }
                group.addTask {
                    try await sleep(timeout)
                    return .timedOut
                }
                defer { group.cancelAll() }
                switch try await group.next() {
                case let .finished(response, responseBody): return (response, responseBody)
                case .timedOut, nil: throw AppError.network
                }
            }
        }
    }
}
