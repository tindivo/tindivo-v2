import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TindivoAPI

private func repository(_ transport: StubTransport) -> LiveCatalogRepository {
    let client = TindivoAPIClient.make(
        baseURL: URL(string: "https://api.test/api/v1")!,
        client: ClientInfo(app: "customer", appVersion: "0.1.0", build: "1"),
        transport: transport
    )
    return LiveCatalogRepository(client: client)
}

/// Respuestas REALES de staging (`/public/businesses` y `/public/businesses/la-florencia-e2e`, 2026-11-22).
private func fixture(_ name: String) throws -> String {
    let url = try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
    return try String(contentsOf: url, encoding: .utf8)
}

private func dec(_ text: String) -> Decimal {
    Decimal(string: text, locale: Locale(identifier: "en_US_POSIX"))!
}

@Suite("Repositorio del catálogo contra el cliente generado")
struct CatalogRepositoryTests {
    @Test("listBusinesses decodifica la lista real y manda las cabeceras del cliente")
    func list() async throws {
        let seen = Seen()
        let body = try fixture("businesses")
        let transport = StubTransport { request in
            await seen.set(path: request.path, platform: request.headerFields[ClientHeaders.platform])
            return (
                HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]),
                HTTPBody(body)
            )
        }

        let list = try await repository(transport).listBusinesses()

        #expect(list.count == 2)
        #expect(list[0].name == "La Florencia E2E")
        #expect(list[0].slug == "la-florencia-e2e")
        #expect(list[0].primaryCapability == .catalogFull)
        #expect(list[0].isOpenNow == true)
        #expect(list[0].estimatedEtaMin == 25 && list[0].estimatedEtaMax == 35)
        #expect(list[0].logoURL == nil)
        #expect(list[1].isOpenNow == false)
        #expect(await seen.path == "/public/businesses")
        #expect(await seen.platform == "ios")
    }

    @Test("getBusiness decodifica la carta real: precios exactos, grupos, opciones y horario")
    func detail() async throws {
        let seen = Seen()
        let body = try fixture("business-detail")
        let transport = StubTransport { request in
            await seen.set(path: request.path, platform: nil)
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(body))
        }

        let menu = try await repository(transport).getBusiness(id: "la-florencia-e2e")

        #expect(await seen.path == "/public/businesses/la-florencia-e2e")
        #expect(menu.business.id == "e2e00000-0000-4000-8000-000000000010")
        #expect(menu.business.primaryCapability == .catalogFull)
        #expect(menu.openingConfirmed == true)
        #expect(menu.featured == nil)
        #expect(menu.schedule.count == 7)
        #expect(menu.schedule[0] == .init(dayOfWeek: 0, isOpen: true, shift1Start: "00:00", shift1End: "23:59"))
        let items = try #require(menu.categories.first).items
        #expect(items.map(\.basePrice) == [dec("45"), dec("25"), dec("8")])
        // La gaseosa del fixture no trae `thumbnail_url`: sigue siendo válido (D-55).
        #expect(items[2].thumbnailURL == nil)
        let group = try #require(items[0].modifierGroups.first)
        #expect(group.selectionType == "multi")
        #expect(group.maxSelections == 3)
        #expect(group.priceDisplay == "delta")
        #expect(group.options.map(\.additionalPrice) == [dec("3"), dec("5"), dec("0")])
    }

    @Test("business con 404 llega como not_found sin lanzar otra cosa")
    func notFound() async {
        let json = #"{"type":"about:blank","title":"No encontrado","status":404,"code":"not_found"}"#
        await #expect(throws: AppError.known(code: .notFound, status: 404, detail: nil, fieldMessage: nil)) {
            try await repository(.json(404, json)).getBusiness(id: "no-existe")
        }
    }

    @Test("un cuerpo ilegible es .unknown, no un crash")
    func unreadableBody() async {
        do {
            _ = try await repository(.json(200, #"{"data":[{"id":"x"}]}"#)).listBusinesses()
            Issue.record("debía fallar")
        } catch {
            guard case .unknown = error else {
                Issue.record("se esperaba .unknown y llegó \(error)")
                return
            }
        }
    }

    @Test("CLI-2: un campo nuevo y una capacidad desconocida no rompen la lista ni la carta")
    func forwardCompatible() async throws {
        let list = try fixture("businesses")
            .replacingOccurrences(of: "\"tagline\":\"Pollos a la brasa\"", with: "\"campoNuevo\":{\"x\":1},\"tagline\":null")
            .replacingOccurrences(of: "\"primary_capability\":\"catalog_full\"", with: "\"primary_capability\":\"capacidad_futura\"")
        let businesses = try await repository(.json(200, list)).listBusinesses()
        #expect(businesses[0].primaryCapability == .unknown("capacidad_futura"))
        #expect(businesses[0].tagline == nil)

        let detail = try fixture("business-detail")
            .replacingOccurrences(of: "\"is_featured\":false", with: "\"is_featured\":false,\"campo_nuevo\":[1,2]")
            .replacingOccurrences(of: "\"selection_type\":\"multi\"", with: "\"selection_type\":\"tipo_futuro\"")
            .replacingOccurrences(of: "\"primary_capability\":\"catalog_full\"", with: "\"primary_capability\":null")
        let menu = try await repository(.json(200, detail)).getBusiness(id: "x")
        #expect(menu.business.primaryCapability == nil)
        #expect(menu.categories[0].items[0].modifierGroups[0].selectionType == "tipo_futuro")
    }

    @Test("un base_price ilegible tumba la carta como .unknown y nunca llega como precio")
    func badBasePrice() async throws {
        let base = try fixture("business-detail")
        for bad in ["\"doce\"", "\"\"", "null", "true", "{}", "12.345"] {
            let json = base.replacingOccurrences(of: "\"base_price\":45", with: "\"base_price\":\(bad)")
            do {
                _ = try await repository(.json(200, json)).getBusiness(id: "x")
                Issue.record("base_price=\(bad) debía fallar")
            } catch {
                guard case .unknown = error else {
                    Issue.record("base_price=\(bad): llegó \(error)")
                    continue
                }
            }
        }
    }

    @Test("un additional_price ilegible tumba la carta; uno válido llega exacto")
    func additionalPrice() async throws {
        let base = try fixture("business-detail")
        for bad in ["\"dos\"", "null", "true", "{}", "[]", "2.505"] {
            let json = base.replacingOccurrences(of: "\"additional_price\":3", with: "\"additional_price\":\(bad)")
            do {
                _ = try await repository(.json(200, json)).getBusiness(id: "x")
                Issue.record("additional_price=\(bad) debía fallar")
            } catch {
                guard case .unknown = error else {
                    Issue.record("additional_price=\(bad): llegó \(error)")
                    continue
                }
            }
        }
        let ok = base.replacingOccurrences(of: "\"additional_price\":3", with: "\"additional_price\":2.50")
        let menu = try await repository(.json(200, ok)).getBusiness(id: "x")
        #expect(menu.categories[0].items[0].modifierGroups[0].options[0].additionalPrice == dec("2.5"))
    }

    @Test("un importe con exponente es un número JSON válido y llega con el mismo valor exacto")
    func exponentPrice() async throws {
        let base = try fixture("business-detail")
        for literal in ["1.25e1", "1.25E+1"] {
            let json = base.replacingOccurrences(of: "\"base_price\":25", with: "\"base_price\":\(literal)")
            let menu = try await repository(.json(200, json)).getBusiness(id: "x")
            #expect(menu.categories[0].items[1].basePrice == dec("12.5"), "\(literal)")
        }
    }

    @Test("sin red es .network")
    func network() async {
        let transport = StubTransport { _ in throw URLError(.notConnectedToInternet) }
        await #expect(throws: AppError.network) { try await repository(transport).listBusinesses() }
    }
}

private actor Seen {
    private(set) var path: String?
    private(set) var platform: String?
    func set(path: String?, platform: String?) {
        self.path = path
        self.platform = platform
    }
}
