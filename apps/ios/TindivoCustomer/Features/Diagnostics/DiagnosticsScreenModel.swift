import Foundation
import Observation
import TindivoAPI

/// Diagnóstico: comprueba que la app llega a la API de su entorno (`/health` y `/config`).
@MainActor
@Observable
final class DiagnosticsScreenModel {
    enum State: Equatable {
        case idle
        case loading
        case loaded(health: ApiHealth, compat: ClientCompat)
        case failed(AppError)
    }

    private(set) var state: State = .idle
    let apiBaseURL: String
    let appVersion: String
    private let system: any SystemRepository

    init(system: any SystemRepository, config: AppConfig) {
        self.system = system
        apiBaseURL = config.apiBaseURL.absoluteString
        appVersion = "\(config.appVersion) (\(config.build))"
    }

    func load() async {
        guard state != .loading else { return }
        state = .loading
        do throws(AppError) {
            // En serie: `async let` pierde el tipo del error (Swift 6.4) y son dos lecturas cortas.
            let health = try await system.health()
            let compat = try await system.clientCompat()
            state = .loaded(health: health, compat: compat)
        } catch .cancelled {
            state = .idle
        } catch {
            state = .failed(error)
        }
    }
}
