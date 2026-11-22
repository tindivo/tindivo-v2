import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Convierte toda respuesta que no sea 2xx en un `AppError` antes de que el código generado la intente decodificar.
///
/// Así la traducción de errores (RFC 9457, 426, códigos nuevos) vive en un solo sitio y no por operación: el cliente
/// generado solo ve respuestas buenas. Va después de `ClientHeadersMiddleware` en la cadena.
public struct ProblemMiddleware: ClientMiddleware {
    /// Un cuerpo de error más grande que esto no es un `ProblemDetails`: no se lee entero.
    static let maxProblemBytes = 64 * 1024

    public init() {}

    public func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let (response, responseBody) = try await next(request, body, baseURL)
        guard response.status.kind != .successful else { return (response, responseBody) }
        var data: Data?
        if let responseBody {
            do {
                data = try await Data(collecting: responseBody, upTo: Self.maxProblemBytes)
            } catch {
                // Si la pantalla se fue mientras se leía el error, es una cancelación, no un error que mostrar.
                if Task.isCancelled || AppError.wrap(error) == .cancelled { throw AppError.cancelled }
                data = nil
            }
        }
        throw AppError.from(status: response.status.code, headers: response.headerFields, body: data)
    }
}

extension AppError {
    /// Lleva cualquier error de una llamada a `AppError` (SW-6). El cliente generado envuelve lo que lanza un
    /// middleware o el transporte en `ClientError`; aquí se desenvuelve.
    public static func wrap(_ error: any Error) -> AppError {
        switch error {
        case let error as AppError:
            error
        case let error as ClientError:
            wrap(error.underlyingError)
        case is CancellationError:
            .cancelled
        case let error as URLError where error.code == .cancelled:
            .cancelled
        case is URLError:
            .network
        default:
            // Un 2xx que no se pudo decodificar, por ejemplo: la UI muestra el genérico (CLI-2).
            .unknown(code: nil, detail: String(describing: type(of: error)), status: nil)
        }
    }
}

/// Ejecuta una llamada del cliente generado y deja solo `AppError` como error posible.
func apiCall<T: Sendable>(_ body: () async throws -> T) async throws(AppError) -> T {
    do {
        return try await body()
    } catch {
        throw AppError.wrap(error)
    }
}
