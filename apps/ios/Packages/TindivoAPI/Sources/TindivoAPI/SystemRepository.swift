import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// Cómo está la API (`GET /health`).
public struct ApiHealth: Sendable, Equatable {
    /// `ok` hoy; un valor nuevo llega tal cual (CLI-2).
    public let status: String
    public let version: String

    public init(status: String, version: String) {
        self.status = status
        self.version = version
    }
}

/// Lo que esta app necesita de `GET /config`: su versión mínima y el sistema mínimo de iOS (D-58: solo el 426
/// bloquea; `minOS` solo avisa).
public struct ClientCompat: Sendable, Equatable {
    public let minAppVersion: String
    public let minOS: Int

    public init(minAppVersion: String, minOS: Int) {
        self.minAppVersion = minAppVersion
        self.minOS = minOS
    }
}

public protocol SystemRepository: Sendable {
    func health() async throws(AppError) -> ApiHealth
    func clientCompat() async throws(AppError) -> ClientCompat
}

/// Los tipos generados (`Operations.*`) no salen de aquí: se traducen a modelos propios.
public struct LiveSystemRepository: SystemRepository {
    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func health() async throws(AppError) -> ApiHealth {
        let data = try await apiCall { try await client.getHealth().ok.body.json.data }
        return ApiHealth(
            status: data.status.value1?.rawValue ?? data.status.value2 ?? "",
            version: data.version.value1?.rawValue ?? data.version.value2 ?? ""
        )
    }

    public func clientCompat() async throws(AppError) -> ClientCompat {
        let data = try await apiCall { try await client.getClientConfig().ok.body.json.data }
        return ClientCompat(minAppVersion: data.minAppVersion.customer.ios, minOS: data.minOs.ios)
    }
}

/// Arma el cliente con la cadena de middlewares del contrato (SW-7), de fuera hacia dentro: plazo total de la llamada,
/// cabeceras (un reintento conserva su `X-Request-Id`), traducción de errores y reintentos pegados al transporte (ven
/// los status crudos).
public enum TindivoAPIClient {
    public static func make(
        baseURL: URL,
        client: ClientInfo,
        transport: any ClientTransport = TindivoHTTP.makeTransport(),
        retry: RetryMiddleware = RetryMiddleware(),
        callTimeout: Duration = TindivoHTTP.callTimeout
    ) -> Client {
        Client(
            serverURL: baseURL,
            configuration: Configuration(dateTranscoder: FlexibleISO8601()),
            transport: transport,
            middlewares: [DeadlineMiddleware(timeout: callTimeout), ClientHeadersMiddleware(client: client), ProblemMiddleware(), retry]
        )
    }
}
