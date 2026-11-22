public import Foundation
public import HTTPTypes
public import OpenAPIRuntime

/// Quién llama a la API (CLI-3). Con estas cabeceras la API decide el 426 de versión mínima (CLI-4) y registra el
/// tráfico por versión (CLI-15).
public struct ClientInfo: Sendable, Equatable {
    /// La app según el contrato: `customer`, `negocios` o `motorizados`.
    public let app: String
    /// `MARKETING_VERSION`, semántica (SW-15).
    public let appVersion: String
    /// `CURRENT_PROJECT_VERSION`, la pone la CI.
    public let build: String

    public init(app: String, appVersion: String, build: String) {
        self.app = app
        self.appVersion = appVersion
        self.build = build
    }
}

/// Nombres de las cabeceras tal como los publica el contrato (`packages/contracts/src/client-compat.ts`).
public enum ClientHeaders {
    public static let platform: HTTPField.Name = .constant("X-Tindivo-Platform")
    public static let app: HTTPField.Name = .constant("X-Tindivo-App")
    public static let appVersion: HTTPField.Name = .constant("X-Tindivo-App-Version")
    public static let build: HTTPField.Name = .constant("X-Tindivo-Build")
    public static let requestId: HTTPField.Name = .constant("X-Request-Id")
    /// La devuelve la API junto al 426 `client_upgrade_required`.
    public static let minVersion: HTTPField.Name = .constant("x-tindivo-min-version")

    public static let platformIOS = "ios"
}

extension HTTPField.Name {
    /// Un nombre de cabecera escrito en el código. Solo falla si alguien escribe un nombre inválido en un literal:
    /// es un error de programación y lo detecta `ClientHeadersTests` antes de llegar a la app, no un caso que manejar.
    static func constant(_ name: StaticString) -> HTTPField.Name {
        guard let parsed = HTTPField.Name("\(name)") else {
            preconditionFailure("Nombre de cabecera inválido: \(name)")
        }
        return parsed
    }
}

/// Pone las cabeceras de cliente en toda petición (SW-7: en un middleware, nunca en cada llamada).
///
/// Va primero en la cadena, antes del de reintentos: un reintento repite la misma petición y conserva su
/// `X-Request-Id`, así que en los registros de la API se ve como el mismo intento lógico (paridad con Android).
public struct ClientHeadersMiddleware: ClientMiddleware {
    private let client: ClientInfo
    private let makeRequestId: @Sendable () -> String

    public init(client: ClientInfo, makeRequestId: @escaping @Sendable () -> String = { UUID().uuidString }) {
        self.client = client
        self.makeRequestId = makeRequestId
    }

    public func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        request.headerFields[ClientHeaders.platform] = ClientHeaders.platformIOS
        request.headerFields[ClientHeaders.app] = client.app
        request.headerFields[ClientHeaders.appVersion] = client.appVersion
        request.headerFields[ClientHeaders.build] = client.build
        request.headerFields[ClientHeaders.requestId] = makeRequestId()
        return try await next(request, body, baseURL)
    }
}
