import Foundation
import Observation
import SwiftUI
import TindivoAPI

/// Lo que la app sabe de la configuración remota (CLI-4), igual que `ConfigState` de Android.
enum ConfigState: Equatable, Sendable {
    /// Todavía no hubo una lectura buena (o no hay red): no se bloquea nada.
    case unknown
    /// La versión de la app sirve. `minOS` es solo un aviso (D-58): lo único que bloquea es la versión mínima de la app.
    case ready(features: [String: ClientFeature], minOS: Int)
    /// La versión de la app quedó por debajo del mínimo. Dura lo que dura el proceso: una lectura buena posterior no
    /// lo deshace.
    case upgradeRequired(minVersion: String?)

    var isUpgradeRequired: Bool {
        if case .upgradeRequired = self { true } else { false }
    }

    var minVersion: String? {
        if case let .upgradeRequired(minVersion) = self { minVersion } else { nil }
    }
}

/// La configuración remota de la app: lee `GET /config` al abrir y al volver a primer plano, y decide si hay que
/// actualizar (CLI-4). Es lo único que sabe de la actualización obligatoria: la pantalla de actualización sale de
/// `state` y todo 426 de la API llega por `reportUpgradeRequired`.
@MainActor
protocol ConfigService: AnyObject, Sendable {
    var state: ConfigState { get }
    /// Lee `/config`. Si ya hay una lectura en curso, espera a esa en vez de lanzar otra.
    func refresh() async
    /// Cualquier llamada que reciba un 426 lo avisa aquí; el estado no se deshace.
    func reportUpgradeRequired(minVersion: String?)
}

extension ConfigService {
    /// Al abrir la app y cada vez que la escena vuelve a `.active`.
    func sceneDidChange(to phase: ScenePhase) async {
        if phase == .active { await refresh() }
    }

    /// El interruptor `key`; si el servidor no lo declara (o aún no hay lectura), `default`. Una clave ausente
    /// significa «usa tu valor por defecto», nunca apagada.
    func isEnabled(_ key: String, default value: Bool) -> Bool {
        feature(key)?.enabled ?? value
    }

    /// El texto que acompaña al interruptor `key`, si el servidor lo trae.
    func message(for key: String) -> String? {
        feature(key)?.message
    }

    private func feature(_ key: String) -> ClientFeature? {
        if case let .ready(features, _) = state { features[key] } else { nil }
    }
}

@MainActor
@Observable
final class LiveConfigService: ConfigService {
    private(set) var state: ConfigState = .unknown

    private let system: any SystemRepository
    private let appVersion: String
    @ObservationIgnored private var inFlight: Task<Void, Never>?
    @ObservationIgnored private var reports: Task<Void, Never>?

    /// `upgradeReports` es el canal por el que la API avisa de un 426 (`TindivoAPIServices.live`): como el cliente se
    /// crea antes que este servicio, el aviso viaja por un `AsyncStream` y no por una referencia.
    init(system: any SystemRepository, appVersion: String, upgradeReports: AsyncStream<String?>? = nil) {
        self.system = system
        self.appVersion = appVersion
        if let upgradeReports {
            reports = Task { [weak self] in
                for await minVersion in upgradeReports {
                    self?.reportUpgradeRequired(minVersion: minVersion)
                }
            }
        }
    }

    func refresh() async {
        if let inFlight {
            await inFlight.value
            return
        }
        // Tarea propia: si quien llama se cancela (la escena cambia otra vez), la lectura en curso no se pierde.
        let task = Task { await read(); inFlight = nil }
        inFlight = task
        await task.value
    }

    func reportUpgradeRequired(minVersion: String?) {
        if case let .upgradeRequired(current) = state, minVersion == nil || current != nil { return }
        state = .upgradeRequired(minVersion: minVersion)
    }

    private func read() async {
        do throws(AppError) {
            apply(try await system.clientCompat())
        } catch {
            // Sin red, 5xx o una respuesta ilegible: se conserva el estado anterior, no se bloquea a nadie.
            if case let .upgradeRequired(minVersion) = error { reportUpgradeRequired(minVersion: minVersion) }
        }
    }

    private func apply(_ compat: ClientCompat) {
        if let minimum = AppVersion(compat.minAppVersion), let own = AppVersion(appVersion), own < minimum {
            reportUpgradeRequired(minVersion: compat.minAppVersion)
            return
        }
        if state.isUpgradeRequired { return }
        state = .ready(features: compat.features, minOS: compat.minOS)
    }
}

#if DEBUG
/// Para las vistas previas: nunca pide actualizar.
@MainActor
final class PreviewConfigService: ConfigService {
    var state: ConfigState = .ready(features: [:], minOS: 17)
    func refresh() async {}
    func reportUpgradeRequired(minVersion: String?) {}
}
#endif
