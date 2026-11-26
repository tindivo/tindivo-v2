import Foundation
import Observation

/// Un aviso breve que se apaga solo («Agregado a tu bolsa»). Mostrar otro reemplaza al anterior y reinicia el plazo.
@MainActor
@Observable
final class TimedNotice {
    private(set) var message: String?

    private let clock: AppClock
    private let duration: Duration
    private var task: Task<Void, Never>?

    init(clock: AppClock, duration: Duration = .seconds(3)) {
        self.clock = clock
        self.duration = duration
    }

    func show(_ text: String) {
        message = text
        task?.cancel()
        task = Task { [clock, duration] in
            do { try await clock.sleep(duration) } catch { return }
            self.message = nil
        }
    }

    func clear() {
        task?.cancel()
        message = nil
    }
}
