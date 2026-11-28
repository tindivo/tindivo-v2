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

    /// M4 (paridad con Android, D-58): el iOS del aparato quedó por debajo de `minOs` de config. Solo avisa; no bloquea.
    func isBelowMinOS(_ osMajor: Int) -> Bool {
        if case let .ready(_, minOS) = self { osMajor < minOS } else { false }
    }

    var isUpgradeRequired: Bool {
        if case .upgradeRequired = self { true } else { false }
    }

    var minVersion: String? {
        if case let .upgradeRequired(minVersion) = self { minVersion } else { nil }
    }
}

/// La configuración remota de la app: lee `GET /config` al abrir y al volver de segundo plano, y decide si hay que
/// actualizar (CLI-4). Es lo único que sabe de la actualización obligatoria: la pantalla de actualización sale de
/// `state` y todo 426 de la API llega por `reportUpgradeRequired`.
@MainActor
protocol ConfigService: AnyObject, Sendable {
    var state: ConfigState { get }
    /// Lee `/config`. Si ya hay una lectura en curso, espera a esa en vez de lanzar otra; si ya hay que actualizar, no
    /// lee (el estado no se deshace).
    func refresh() async
    /// Cualquier llamada que reciba un 426 lo avisa aquí; el estado no se deshace.
    func reportUpgradeRequired(minVersion: String?)
    /// Al abrir la app se lee una vez, y de nuevo cada vez que la escena pasa de segundo plano a `.active`. Un paso por
    /// `.inactive` (centro de control, una llamada) no relee.
    func sceneDidChange(to phase: ScenePhase) async
}

extension ConfigService {
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

    private struct Waiter {
        let predicate: (ConfigState) -> Bool
        let continuation: CheckedContinuation<Void, Never>
    }

    private let system: any SystemRepository
    private let appVersion: String
    @ObservationIgnored private var inFlight: Task<Void, Never>?
    @ObservationIgnored private var needsRead = true
    @ObservationIgnored private var waiters: [Waiter] = []
    /// `nonisolated(unsafe)`: solo `deinit` la toca, para cancelar la escucha cuando el servicio se libera.
    @ObservationIgnored nonisolated(unsafe) private var reports: Task<Void, Never>?

    /// `upgradeReports` es el canal por el que la API avisa de un 426 (`TindivoAPIServices.live`): como el cliente se
    /// crea antes que este servicio, el aviso viaja por un `AsyncStream` y no por una referencia.
    init(system: any SystemRepository, appVersion: String, upgradeReports: AsyncStream<String?>? = nil) {
        self.system = system
        self.appVersion = appVersion
        if let upgradeReports {
            reports = Task { [weak self] in
                for await minVersion in upgradeReports {
                    guard let self else { return }  // el servicio se fue: la escucha termina
                    self.reportUpgradeRequired(minVersion: minVersion)
                }
            }
        }
    }

    deinit {
        reports?.cancel()
    }

    func sceneDidChange(to phase: ScenePhase) async {
        switch phase {
        case .background:
            needsRead = true
        case .active:
            guard needsRead else { return }
            needsRead = false
            await refresh()
        default:
            break
        }
    }

    func refresh() async {
        guard !state.isUpgradeRequired else { return }
        if let inFlight {
            await inFlight.value
            return
        }
        // Tarea propia: si quien llama se cancela (la escena cambia otra vez), la lectura en curso no se pierde.
        let task = Task {
            await read(); inFlight = nil
        }
        inFlight = task
        await task.value
    }

    func reportUpgradeRequired(minVersion: String?) {
        if case let .upgradeRequired(current) = state, minVersion == nil || current != nil { return }
        setState(.upgradeRequired(minVersion: minVersion))
    }

    /// Espera a que `state` cumpla `predicate` (sin reloj ni sondeo). Para pruebas: lo que llega por un canal asíncrono
    /// se espera por su efecto.
    func waitUntil(_ predicate: @escaping (ConfigState) -> Bool) async {
        if predicate(state) { return }
        await withCheckedContinuation { waiters.append(Waiter(predicate: predicate, continuation: $0)) }
    }

    private func setState(_ new: ConfigState) {
        state = new
        var pending: [Waiter] = []
        for waiter in waiters {
            if waiter.predicate(new) { waiter.continuation.resume() } else { pending.append(waiter) }
        }
        waiters = pending
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
        setState(.ready(features: compat.features, minOS: compat.minOS))
    }
}

#if DEBUG
/// Una configuración fija, sin red: para las vistas previas y para `-tindivo-fake-catalog` / `-tindivo-force-upgrade`.
@MainActor
final class FixedConfigService: ConfigService {
    private(set) var state: ConfigState
    init(_ state: ConfigState = .ready(features: [:], minOS: 17)) { self.state = state }
    func refresh() async {}
    func reportUpgradeRequired(minVersion: String?) {}
    func sceneDidChange(to phase: ScenePhase) async {}
}
#endif
