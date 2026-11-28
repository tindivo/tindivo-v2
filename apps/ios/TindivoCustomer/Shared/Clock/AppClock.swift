import Foundation

/// El reloj de la app, inyectable (SW-4): lo que decide si un negocio está abierto o un plato en su franja recibe el
/// `Date` de «ahora», y quien lo vuelve a preguntar cada minuto duerme con `sleep`. Las pruebas lo mueven a mano.
struct AppClock: Sendable {
    var now: @Sendable () -> Date
    var sleep: @Sendable (Duration) async throws -> Void

    static let live = AppClock(
        now: { Date() },
        sleep: { try await Task.sleep(for: $0) }
    )
}
