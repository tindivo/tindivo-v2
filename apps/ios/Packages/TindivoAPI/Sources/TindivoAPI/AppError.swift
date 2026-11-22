public import Foundation
public import HTTPTypes

/// Códigos de negocio del contrato (`packages/contracts/src/errors.ts`, `API_ERROR_CODES`). El OpenAPI no los declara
/// como enum (solo como `x-known-values`), así que esta lista va escrita a mano: si el contrato añade uno, se añade
/// aquí; mientras tanto llega como `AppError.unknown` (CLI-2).
public enum ApiErrorCode: String, Sendable, CaseIterable {
    case validationError = "validation_error"
    case unauthorized
    case forbidden
    case notFound = "not_found"
    case conflict
    case idempotencyConflict = "idempotency_conflict"
    case rateLimited = "rate_limited"
    case invalidStateTransition = "invalid_state_transition"
    case businessBlocked = "business_blocked"
    case orderNotCancellable = "order_not_cancellable"
    case paymentRequired = "payment_required"
    case clientUpgradeRequired = "client_upgrade_required"
    case internalError = "internal_error"
}

/// Todo lo que puede salir mal en una llamada a la API, ya traducido (SW-6). La UI decide por el caso, nunca por
/// el texto de `detail` (API-5).
public enum AppError: Error, Sendable, Equatable {
    /// 426: la versión de la app quedó por debajo del mínimo (CLI-4). `minVersion` viene de `x-tindivo-min-version`.
    case upgradeRequired(minVersion: String?)
    /// Sin conexión, tiempo agotado o corte a mitad de la petición.
    case network
    /// La tarea se canceló (la pantalla se fue): no se muestra nada.
    case cancelled
    /// Un `code` del contrato que esta versión conoce. `fieldMessage`: el primer campo inválido del 422, tal cual.
    case known(code: ApiErrorCode, status: Int, detail: String?, fieldMessage: String?)
    /// Un `code` que esta versión no conoce, o una respuesta que no se pudo leer (CLI-2): la UI muestra un genérico.
    case unknown(code: String?, detail: String?, status: Int?)
}

/// La forma RFC 9457 que devuelve la API (`ProblemDetails` del OpenAPI). Se decodifica a mano y con todo opcional:
/// un cuerpo raro nunca debe lanzar hacia arriba.
struct ProblemDetails: Decodable {
    struct FieldIssue: Decodable {
        let field: String?
        let message: String?
    }

    let code: String?
    let detail: String?
    let errors: [FieldIssue]?
}

extension AppError {
    /// Traduce una respuesta de error a `AppError`. Nunca lanza: un cuerpo ausente, que no es JSON o que no tiene la
    /// forma de `ProblemDetails` termina en `.unknown` con el status HTTP.
    public static func from(status: Int, headers: HTTPFields, body: Data?) -> AppError {
        let problem = body.flatMap { try? JSONDecoder().decode(ProblemDetails.self, from: $0) }
        if status == 426 || problem?.code == ApiErrorCode.clientUpgradeRequired.rawValue {
            return .upgradeRequired(minVersion: headers[ClientHeaders.minVersion])
        }
        guard let problem else {
            return .unknown(code: nil, detail: "HTTP \(status)", status: status)
        }
        guard let code = problem.code.flatMap(ApiErrorCode.init(rawValue:)) else {
            return .unknown(code: problem.code, detail: problem.detail, status: status)
        }
        return .known(
            code: code,
            status: status,
            detail: problem.detail,
            fieldMessage: problem.errors?.first?.message
        )
    }
}
