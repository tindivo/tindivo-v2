import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TindivoAPI

@Suite("Cabeceras de cliente (CLI-3)")
struct ClientHeadersTests {
    @Test("toda petición sale con plataforma ios, app, versión, build y un X-Request-Id")
    func setsHeaders() async throws {
        let middleware = ClientHeadersMiddleware(
            client: ClientInfo(app: "customer", appVersion: "0.1.0", build: "7"),
            makeRequestId: { "req-1" }
        )
        let captured = Captured()
        _ = try await middleware.intercept(
            HTTPRequest(method: .get, scheme: nil, authority: nil, path: "/health"),
            body: nil,
            baseURL: URL(string: "https://example.test/api/v1")!,
            operationID: "getHealth"
        ) { request, body, _ in
            await captured.set(request)
            return (HTTPResponse(status: .ok), body)
        }
        let fields = try #require(await captured.request).headerFields
        #expect(fields[ClientHeaders.platform] == "ios")
        #expect(fields[ClientHeaders.app] == "customer")
        #expect(fields[ClientHeaders.appVersion] == "0.1.0")
        #expect(fields[ClientHeaders.build] == "7")
        #expect(fields[ClientHeaders.requestId] == "req-1")
    }

    @Test("los nombres coinciden con el contrato, en minúscula")
    func namesMatchContract() {
        #expect(ClientHeaders.platform.canonicalName == "x-tindivo-platform")
        #expect(ClientHeaders.app.canonicalName == "x-tindivo-app")
        #expect(ClientHeaders.appVersion.canonicalName == "x-tindivo-app-version")
        #expect(ClientHeaders.build.canonicalName == "x-tindivo-build")
    }
}

private actor Captured {
    var request: HTTPRequest?
    func set(_ request: HTTPRequest) { self.request = request }
}

@Suite("Errores RFC 9457 (SW-6, CLI-2, CLI-4)")
struct AppErrorTests {
    private func body(_ json: String) -> Data { Data(json.utf8) }

    @Test("un 426 es actualización obligatoria con la versión mínima de la cabecera")
    func upgradeRequired() {
        var headers = HTTPFields()
        headers[ClientHeaders.minVersion] = "1.2.0"
        let error = AppError.from(status: 426, headers: headers, body: body(#"{"code":"client_upgrade_required"}"#))
        #expect(error == .upgradeRequired(minVersion: "1.2.0"))
    }

    @Test("un código conocido se traduce y conserva el primer mensaje de campo")
    func known() {
        let json = #"{"code":"validation_error","detail":"x","errors":[{"field":"name","message":"Falta el nombre"}]}"#
        let error = AppError.from(status: 422, headers: [:], body: body(json))
        #expect(error == .known(code: .validationError, status: 422, detail: "x", fieldMessage: "Falta el nombre"))
    }

    @Test("un código nuevo no rompe: llega como desconocido con su código")
    func unknownCode() {
        let error = AppError.from(status: 409, headers: [:], body: body(#"{"code":"algo_nuevo","detail":"d"}"#))
        #expect(error == .unknown(code: "algo_nuevo", detail: "d", status: 409))
    }

    @Test("un cuerpo que no es JSON termina en desconocido con el status")
    func garbage() {
        let error = AppError.from(status: 502, headers: [:], body: body("<html>bad gateway</html>"))
        #expect(error == .unknown(code: nil, detail: "HTTP 502", status: 502))
    }

    @Test("la lista de códigos es la del contrato")
    func codesMatchContract() {
        #expect(ApiErrorCode.allCases.count == 13)
    }
}

@Suite("Dinero (SW-8)")
struct MoneyTests {
    @Test("parsea la cadena decimal de la API sin pasar por Double")
    func parse() {
        #expect(Money.parse("12.50") == Decimal(string: "12.50", locale: Locale(identifier: "en_US_POSIX")))
        #expect(Money.parse("0.10")! + Money.parse("0.20")! == Money.parse("0.30"))
    }

    @Test("rechaza lo que no es un decimal completo", arguments: ["12,50", "12.5x", "", "abc", "1e3"])
    func rejects(raw: String) {
        #expect(Money.parse(raw) == nil)
    }

    @Test("formatea en soles como la región Perú")
    func format() {
        #expect(
            Money.format(Money.parse("12.5")!) == "S/\u{00A0}12.50",
            "es_PE separa el símbolo con un espacio duro, igual que en Android")
    }
}
