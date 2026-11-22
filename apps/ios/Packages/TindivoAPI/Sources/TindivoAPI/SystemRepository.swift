public import Foundation
public import OpenAPIRuntime
public import OpenAPIURLSession

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

/// Un interruptor de `GET /config`: `enabled == false` es el kill switch y `message` lo que se muestra.
public struct ClientFeature: Sendable, Equatable {
    public let enabled: Bool
    public let message: String?

    public init(enabled: Bool, message: String? = nil) {
        self.enabled = enabled
        self.message = message
    }
}

/// Lo que esta app necesita de `GET /config`: su versión mínima, el sistema mínimo de iOS (D-58: solo el 426
/// bloquea; `minOS` solo avisa) y los interruptores remotos.
public struct ClientCompat: Sendable, Equatable {
    public let minAppVersion: String
    public let minOS: Int
    public let features: [String: ClientFeature]

    public init(minAppVersion: String, minOS: Int, features: [String: ClientFeature] = [:]) {
        self.minAppVersion = minAppVersion
        self.minOS = minOS
        self.features = features
    }
}

public protocol SystemRepository: Sendable {
    func health() async throws(AppError) -> ApiHealth
    func clientCompat() async throws(AppError) -> ClientCompat
}

/// Los tipos generados (`Operations.*`) no salen de aquí: se traducen a modelos propios.
public struct LiveSystemRepository: SystemRepository {
    private let client: Client

    package init(client: Client) {
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
        return ClientCompat(
            minAppVersion: data.minAppVersion.customer.ios,
            minOS: data.minOs.ios,
            features: data.features.additionalProperties.mapValues {
                ClientFeature(enabled: $0.enabled, message: $0.message)
            }
        )
    }
}

/// Arma el cliente con la cadena de middlewares del contrato (SW-7), de fuera hacia dentro: plazo total de la llamada,
/// cabeceras (un reintento conserva su `X-Request-Id`), traducción de errores y reintentos pegados al transporte (ven
/// los status crudos).
public enum TindivoAPIClient {
    package static func make(
        baseURL: URL,
        client: ClientInfo,
        transport: any ClientTransport = TindivoHTTP.makeTransport(),
        retry: RetryMiddleware = RetryMiddleware(),
        callTimeout: Duration = TindivoHTTP.callTimeout,
        onUpgradeRequired: (@Sendable (_ minVersion: String?) -> Void)? = nil
    ) -> Client {
        Client(
            serverURL: baseURL,
            configuration: Configuration(dateTranscoder: FlexibleISO8601()),
            transport: transport,
            middlewares: [DeadlineMiddleware(timeout: callTimeout), ClientHeadersMiddleware(client: client), ProblemMiddleware(onUpgradeRequired: onUpgradeRequired), retry]
        )
    }
}

/// Los repositorios de la API, listos para inyectar. Es lo único que la app necesita para hablar con el servidor: el
/// cliente generado (`Client`, `Operations.*`) es `package` y no sale de este paquete (DES-1, DES-2).
public struct TindivoAPIServices: Sendable {
    public let system: any SystemRepository
    public let catalog: any CatalogRepository

    /// `onUpgradeRequired` se llama con la versión mínima cada vez que CUALQUIER llamada recibe un 426 (CLI-4).
    public static func live(
        baseURL: URL,
        client: ClientInfo,
        onUpgradeRequired: (@Sendable (_ minVersion: String?) -> Void)? = nil
    ) -> TindivoAPIServices {
        let generated = TindivoAPIClient.make(baseURL: baseURL, client: client, onUpgradeRequired: onUpgradeRequired)
        return TindivoAPIServices(
            system: LiveSystemRepository(client: generated),
            catalog: LiveCatalogRepository(client: generated)
        )
    }
}
