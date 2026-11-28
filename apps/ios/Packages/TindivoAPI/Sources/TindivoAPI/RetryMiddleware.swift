public import Foundation
public import HTTPTypes
package import OpenAPIRuntime

/// Reintentos de CLI-10, con la misma política que `RetryInterceptor.kt`:
/// - solo `GET` y `POST` con `Idempotency-Key` no vacía (repetirlo no duplica nada);
/// - solo ante error de red, `5xx` o `429`; ningún otro `4xx` (el servidor ya contestó que no);
/// - como mucho `maxRetries` veces, con espera exponencial y aleatoria completa (el reintento `n` espera entre 0 y
///   0,5 s × 2ⁿ) para que muchas apps que fallan a la vez no vuelvan juntas;
/// - si la respuesta trae `Retry-After` (segundos o fecha HTTP), manda ese valor; si pide más de 10 s, se devuelve la
///   respuesta sin esperar y la pantalla lo dice.
///
/// Va el último de la cadena, pegado al transporte: ve los status crudos antes de que `ProblemMiddleware` los traduzca.
package struct RetryMiddleware: ClientMiddleware {
    package static let maxRetries = 2
    static let baseMillis: UInt64 = 500
    static let maxRetryAfterMillis: UInt64 = 10_000
    static let idempotencyKey = HTTPField.Name.constant("Idempotency-Key")
    static let retryAfter = HTTPField.Name.constant("Retry-After")

    private let sleep: @Sendable (_ millis: UInt64) async throws -> Void
    private let random: @Sendable (_ upTo: UInt64) -> UInt64
    private let now: @Sendable () -> Date

    package init(
        sleep: @escaping @Sendable (_ millis: UInt64) async throws -> Void = {
            try await Task.sleep(for: .milliseconds($0))
        },
        random: @escaping @Sendable (_ upTo: UInt64) -> UInt64 = { UInt64.random(in: 0...$0) },
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.sleep = sleep
        self.random = random
        self.now = now
    }

    package func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard Self.isRetryable(request) else { return try await next(request, body, baseURL) }
        var retries = 0
        while true {
            let response: HTTPResponse
            let responseBody: HTTPBody?
            do {
                (response, responseBody) = try await next(request, body, baseURL)
            } catch {
                guard retries < Self.maxRetries, Self.isNetworkFailure(error) else { throw error }
                try await sleep(backoff(retries))
                retries += 1
                continue
            }
            guard Self.isRetryableStatus(response.status.code), retries < Self.maxRetries else {
                return (response, responseBody)
            }
            let wait: UInt64
            switch retryAfterMillis(response.headerFields[Self.retryAfter]) {
            case .tooLong: return (response, responseBody)
            case let .millis(value): wait = value
            case .absent: wait = backoff(retries)
            }
            try await sleep(wait)
            retries += 1
        }
    }

    static func isRetryable(_ request: HTTPRequest) -> Bool {
        if request.method == .get { return true }
        let key = request.headerFields[idempotencyKey]?.trimmingCharacters(in: .whitespaces) ?? ""
        return request.method == .post && !key.isEmpty
    }

    static func isRetryableStatus(_ code: Int) -> Bool {
        code == 429 || (500...599).contains(code)
    }

    /// Error de red: lo que lanza `URLSession`, salvo la cancelación, que nunca se reintenta.
    static func isNetworkFailure(_ error: any Error) -> Bool {
        let underlying = (error as? ClientError)?.underlyingError ?? error
        guard let urlError = underlying as? URLError else { return false }
        return urlError.code != .cancelled
    }

    private func backoff(_ retry: Int) -> UInt64 {
        random(Self.baseMillis << UInt64(retry))
    }

    enum RetryAfter: Equatable {
        case absent
        case tooLong
        case millis(UInt64)
    }

    func retryAfterMillis(_ raw: String?) -> RetryAfter {
        guard let value = raw?.trimmingCharacters(in: .whitespaces), !value.isEmpty else { return .absent }
        if value.allSatisfy(\.isASCII), value.allSatisfy(\.isNumber) {
            guard let seconds = UInt64(value), seconds <= Self.maxRetryAfterMillis / 1000 else { return .tooLong }
            return .millis(seconds * 1000)
        }
        guard let date = Self.httpDate(value) else { return .absent }
        let wait = date.timeIntervalSince(now())
        if wait <= 0 { return .millis(0) }
        let millis = UInt64(wait * 1000)
        return millis > Self.maxRetryAfterMillis ? .tooLong : .millis(millis)
    }

    /// Fecha HTTP (RFC 9110, IMF-fixdate): `Sun, 06 Nov 1994 08:49:37 GMT`.
    static func httpDate(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "GMT")
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return formatter.date(from: value)
    }
}
