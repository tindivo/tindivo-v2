import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Un transporte que responde lo que se le diga, sin red.
struct StubTransport: ClientTransport {
    let respond: @Sendable (HTTPRequest) async throws -> (HTTPResponse, HTTPBody?)

    func send(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        try await respond(request)
    }

    static func json(_ status: Int, _ json: String, headers: HTTPFields = [:]) -> StubTransport {
        StubTransport { _ in
            var fields = headers
            fields[.contentType] = "application/json"
            return (HTTPResponse(status: .init(code: status), headerFields: fields), HTTPBody(json))
        }
    }
}
