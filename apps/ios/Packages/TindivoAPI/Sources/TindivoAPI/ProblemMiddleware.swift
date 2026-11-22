public import Foundation
public import HTTPTypes
package import OpenAPIRuntime

/// Convierte toda respuesta que no sea 2xx en un `AppError` antes de que el código generado la intente decodificar.
///
/// Así la traducción de errores (RFC 9457, 426, códigos nuevos) vive en un solo sitio y no por operación: el cliente
/// generado solo ve respuestas buenas. Va después de `ClientHeadersMiddleware` en la cadena.
package struct ProblemMiddleware: ClientMiddleware {
    /// Un cuerpo de error más grande que esto no es un `ProblemDetails`: no se lee entero.
    static let maxProblemBytes = 64 * 1024

    /// Aviso de un 426 (CLI-4): la app lo usa para mostrar la pantalla de actualización desde un solo sitio, sin que
    /// cada repositorio ni cada pantalla tenga que acordarse. Recibe la versión mínima de la cabecera, si viene.
    private let onUpgradeRequired: (@Sendable (_ minVersion: String?) -> Void)?

    package init(onUpgradeRequired: (@Sendable (_ minVersion: String?) -> Void)? = nil) {
        self.onUpgradeRequired = onUpgradeRequired
    }

    package func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let (response, responseBody) = try await next(request, body, baseURL)
        guard response.status.kind != .successful else { return (response, responseBody) }
        // El aviso de actualización sale ANTES de leer el cuerpo: un cuerpo lento o cancelado (plazo vencido, la pantalla
        // se fue) no debe hacer que se pierda el 426.
        let isUpgradeStatus = response.status.code == 426
        if isUpgradeStatus { onUpgradeRequired?(response.headerFields[ClientHeaders.minVersion]) }
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
        let error = AppError.from(status: response.status.code, headers: response.headerFields, body: data)
        // Un `client_upgrade_required` con otro status solo se sabe leyendo el cuerpo.
        if !isUpgradeStatus, case let .upgradeRequired(minVersion) = error { onUpgradeRequired?(minVersion) }
        throw error
    }
}

extension AppError {
    /// Lleva cualquier error de una llamada a `AppError` (SW-6). El cliente generado envuelve lo que lanza un
    /// middleware o el transporte en `ClientError`; aquí se desenvuelve.
    package static func wrap(_ error: any Error) -> AppError {
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
