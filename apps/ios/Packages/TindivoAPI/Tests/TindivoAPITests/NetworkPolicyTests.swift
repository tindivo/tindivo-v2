import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TindivoAPI

/// Cuenta los intentos y responde, por turno, lo que diga la lista.
private actor Script {
    enum Step { case status(Int, retryAfter: String? = nil), fail(URLError.Code) }
    private var steps: [Step]
    private(set) var attempts = 0
    private(set) var sleeps: [UInt64] = []

    init(_ steps: [Step]) { self.steps = steps }

    func next() throws -> (HTTPResponse, HTTPBody?) {
        attempts += 1
        switch steps.removeFirst() {
        case let .status(code, retryAfter):
            var fields = HTTPFields()
            if let retryAfter { fields[RetryMiddleware.retryAfter] = retryAfter }
            return (HTTPResponse(status: .init(code: code), headerFields: fields), nil)
        case let .fail(code):
            throw URLError(code)
        }
    }

    func slept(_ millis: UInt64) { sleeps.append(millis) }
}

@Suite("Reintentos (CLI-10)")
struct RetryMiddlewareTests {
    private func run(
        _ method: HTTPRequest.Method,
        idempotencyKey: String? = nil,
        _ steps: [Script.Step],
        now: Date = Date()
    ) async -> (script: Script, status: Int?) {
        let script = Script(steps)
        let middleware = RetryMiddleware(
            sleep: { await script.slept($0) },
            random: { $0 }, // la espera máxima de cada tramo, para poder afirmarla
            now: { now }
        )
        var request = HTTPRequest(method: method, scheme: nil, authority: nil, path: "/x")
        if let idempotencyKey { request.headerFields[RetryMiddleware.idempotencyKey] = idempotencyKey }
        let status = try? await middleware.intercept(
            request, body: nil, baseURL: URL(string: "https://api.test")!, operationID: "op"
        ) { _, _, _ in try await script.next() }.0.status.code
        return (script, status)
    }

    @Test("un GET con 503 se reintenta dos veces con espera exponencial y luego devuelve la respuesta")
    func getRetriesTwice() async {
        let (script, status) = await run(.get, [.status(503), .status(503), .status(503)])
        #expect(await script.attempts == 3)
        #expect(await script.sleeps == [500, 1000])
        #expect(status == 503)
    }

    @Test("un 429 seguido de 200 termina bien")
    func tooManyThenOk() async {
        let (script, status) = await run(.get, [.status(429), .status(200)])
        #expect(await script.attempts == 2)
        #expect(status == 200)
    }

    @Test("un error de red se reintenta; una cancelación no")
    func networkFailure() async {
        let (retried, okStatus) = await run(.get, [.fail(.networkConnectionLost), .status(200)])
        #expect(await retried.attempts == 2)
        #expect(okStatus == 200)
        let (cancelled, _) = await run(.get, [.fail(.cancelled), .status(200)])
        #expect(await cancelled.attempts == 1)
    }

    @Test("ningún otro 4xx se reintenta")
    func noRetryOn4xx() async {
        let (script, status) = await run(.get, [.status(409), .status(200)])
        #expect(await script.attempts == 1)
        #expect(status == 409)
    }

    @Test("un POST sin Idempotency-Key no se reintenta; con clave, sí")
    func postNeedsKey() async {
        let (withoutKey, _) = await run(.post, [.status(503), .status(200)])
        #expect(await withoutKey.attempts == 1)
        let (withKey, status) = await run(.post, idempotencyKey: "k-1", [.status(503), .status(200)])
        #expect(await withKey.attempts == 2)
        #expect(status == 200)
    }

    @Test("Retry-After en segundos manda; si pide más de 10 s, no se espera")
    func retryAfterSeconds() async {
        let (honoured, _) = await run(.get, [.status(503, retryAfter: "3"), .status(200)])
        #expect(await honoured.sleeps == [3000])
        let (tooLong, status) = await run(.get, [.status(503, retryAfter: "60"), .status(200)])
        #expect(await tooLong.attempts == 1)
        #expect(status == 503)
    }

    @Test("Retry-After como fecha HTTP")
    func retryAfterDate() async {
        let now = Date(timeIntervalSince1970: 784_111_775) // Sun, 06 Nov 1994 08:49:35 GMT
        let (script, _) = await run(.get, [.status(503, retryAfter: "Sun, 06 Nov 1994 08:49:37 GMT"), .status(200)], now: now)
        #expect(await script.sleeps == [2000])
    }
}

@Suite("Fechas del contrato")
struct FlexibleISO8601Tests {
    @Test("acepta con y sin fracción, con Z y con desfase", arguments: [
        "2026-11-22T07:30:47Z",
        "2026-11-22T07:30:47.542Z",
        "2026-11-22T07:30:47.542123+00:00",
        "2026-11-22T02:30:47.542-05:00",
    ])
    func decodes(raw: String) throws {
        let date = try FlexibleISO8601().decode(raw)
        #expect(abs(date.timeIntervalSince1970 - 1_795_332_647) < 1)
    }

    @Test("rechaza lo que no es una fecha")
    func rejects() {
        #expect(throws: DecodingError.self) { try FlexibleISO8601().decode("ayer") }
    }
}

/// Responde siempre un 302 hacia otro origen.
final class RedirectingProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url, url.host() == "api.test" else {
            let ok = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: ok, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(#"{"data":{"status":"ok","service":"tindivo-api","version":"v1","time":"t"}}"#.utf8))
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        let target = URL(string: "https://evil.test/api/v1/health")!
        let response = HTTPURLResponse(url: url, statusCode: 302, httpVersion: nil, headerFields: ["Location": target.absoluteString])!
        client?.urlProtocol(self, wasRedirectedTo: URLRequest(url: target), redirectResponse: response)
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@Suite("Sesión HTTP")
struct TindivoHTTPTests {
    @Test("una redirección no se sigue: el 302 llega como error y no se va a otro origen")
    func noRedirects() async {
        let session = TindivoHTTP.makeSession(protocolClasses: [RedirectingProtocol.self])
        let client = TindivoAPIClient.make(
            baseURL: URL(string: "https://api.test/api/v1")!,
            client: ClientInfo(app: "customer", appVersion: "0.1.0", build: "1"),
            transport: TindivoHTTP.makeTransport(session: session)
        )
        await #expect(throws: AppError.unknown(code: nil, detail: "HTTP 302", status: 302)) {
            try await LiveSystemRepository(client: client).health()
        }
    }

    @Test("los plazos por intento son los de CLI-10 (30 s); el total de la llamada va en DeadlineMiddleware")
    func timeouts() {
        let configuration = TindivoHTTP.makeSession().configuration
        #expect(configuration.timeoutIntervalForRequest == 30)
        #expect(configuration.timeoutIntervalForResource == 30)
    }
}

@Suite("Plazo total de la llamada (CLI-10)")
struct CallDeadlineTests {
    private static let health = #"{"data":{"status":"ok","service":"tindivo-api","version":"v1","time":"t"}}"#

    private func repository(
        callTimeout: Duration,
        retry: RetryMiddleware = RetryMiddleware(random: { $0 }),
        _ respond: @escaping @Sendable (HTTPRequest) async throws -> (HTTPResponse, HTTPBody?)
    ) -> LiveSystemRepository {
        LiveSystemRepository(client: TindivoAPIClient.make(
            baseURL: URL(string: "https://api.test/api/v1")!,
            client: ClientInfo(app: "customer", appVersion: "0.1.0", build: "1"),
            transport: StubTransport(respond: respond),
            retry: retry,
            callTimeout: callTimeout
        ))
    }

    /// Mide cuánto tarda la llamada y qué error devuelve; una cadena que se pasara del plazo la corta el límite de la prueba.
    private func timed(_ repository: LiveSystemRepository) async -> (elapsed: Duration, error: AppError?) {
        let clock = ContinuousClock()
        let start = clock.now
        var caught: AppError?
        do throws(AppError) { _ = try await repository.health() } catch { caught = error }
        return (clock.now - start, caught)
    }

    @Test("CLI-10: un transporte que no contesta se corta al vencer el plazo total y devuelve .network")
    func hungTransportIsCut() async {
        let repo = repository(callTimeout: .milliseconds(100)) { _ in
            try await Task.sleep(for: .seconds(60))
            throw URLError(.timedOut)
        }
        let result = await timed(repo)
        #expect(result.error == .network)
        #expect(result.elapsed < .seconds(5))
    }

    @Test("CLI-10: los reintentos por error de red no pasan del plazo total (la espera del reintento se corta)")
    func retriesStayWithinDeadline() async {
        let attempts = Counter()
        // Con random = tope, el primer reintento espera 500 ms; el plazo es de 100 ms.
        let repo = repository(callTimeout: .milliseconds(100)) { _ in
            await attempts.bump()
            throw URLError(.networkConnectionLost)
        }
        let result = await timed(repo)
        #expect(result.error == .network)
        #expect(result.elapsed < .seconds(5))
        #expect(await attempts.value == 1)
    }

    @Test("CLI-10: un Retry-After largo (aceptado por la política, hasta 10 s) no supera el plazo total")
    func longRetryAfterStaysWithinDeadline() async {
        let attempts = Counter()
        let repo = repository(callTimeout: .milliseconds(100)) { _ in
            await attempts.bump()
            return (HTTPResponse(status: .serviceUnavailable, headerFields: [RetryMiddleware.retryAfter: "9"]), nil)
        }
        let result = await timed(repo)
        #expect(result.error == .network)
        #expect(result.elapsed < .seconds(5))
        #expect(await attempts.value == 1)
    }

    @Test("CLI-10: dentro del plazo la llamada no se altera")
    func withinDeadlineIsUntouched() async throws {
        let repo = repository(callTimeout: .seconds(30)) { _ in
            (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(Self.health))
        }
        let health = try await repo.health()
        #expect(health.status == "ok")
    }

    @Test("CLI-10: el plazo total por defecto es de 30 s, como callTimeout de Android")
    func defaultIsThirtySeconds() {
        #expect(TindivoHTTP.callTimeout == .seconds(30))
    }

    @Test("una cancelación de quien llama sigue siendo .cancelled, no .network")
    func callerCancellationIsNotATimeout() async {
        let repo = repository(callTimeout: .seconds(30)) { _ in
            try await Task.sleep(for: .seconds(60))
            throw URLError(.timedOut)
        }
        let task = Task { () -> AppError? in
            do throws(AppError) { _ = try await repo.health(); return nil } catch { return error }
        }
        try? await Task.sleep(for: .milliseconds(50))
        task.cancel()
        #expect(await task.value == .cancelled)
    }
}

private actor Counter {
    private(set) var value = 0
    func bump() { value += 1 }
}
