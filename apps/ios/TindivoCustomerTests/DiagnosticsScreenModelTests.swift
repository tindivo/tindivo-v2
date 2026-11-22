import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

private struct FakeSystem: SystemRepository {
    var healthResult: Result<ApiHealth, AppError> = .success(ApiHealth(status: "ok", version: "v1"))
    var compatResult: Result<ClientCompat, AppError> = .success(ClientCompat(minAppVersion: "0.0.0", minOS: 17))

    func health() async throws(AppError) -> ApiHealth { try healthResult.get() }
    func clientCompat() async throws(AppError) -> ClientCompat { try compatResult.get() }
}

@MainActor
@Suite("Diagnóstico")
struct DiagnosticsScreenModelTests {
    private let config = AppConfig.fromBundle(.main)

    @Test("carga /health y /config")
    func loads() async {
        let model = DiagnosticsScreenModel(system: FakeSystem(), config: config)
        await model.load()
        #expect(model.state == .loaded(
            health: ApiHealth(status: "ok", version: "v1"),
            compat: ClientCompat(minAppVersion: "0.0.0", minOS: 17)
        ))
    }

    @Test("un fallo de cualquiera de las dos queda como error")
    func fails() async {
        let model = DiagnosticsScreenModel(system: FakeSystem(compatResult: .failure(.network)), config: config)
        await model.load()
        #expect(model.state == .failed(.network))
    }

    @Test("una cancelación no se muestra como error")
    func cancelled() async {
        let model = DiagnosticsScreenModel(system: FakeSystem(healthResult: .failure(.cancelled)), config: config)
        await model.load()
        #expect(model.state == .idle)
    }
}

@Suite("Configuración de Dev")
struct DevConfigTests {
    @Test("apunta a staging con el bundle .dev")
    func staging() {
        let config = AppConfig.fromBundle(.main)
        #expect(config.apiBaseURL.absoluteString == "https://tindivo-api-staging.vercel.app/api/v1")
        #expect(config.supabaseURL.host() == "jgziumvrtogguljhpdos.supabase.co")
        #expect(Bundle.main.bundleIdentifier == "com.tindivo.customer.dev")
    }
}
