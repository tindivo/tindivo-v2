import Foundation
import os
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// Respuestas que se entregan una a una; la última se repite. Así una prueba cuenta «primero bien, luego falla».
final class Script<Value: Sendable>: Sendable {
    private let results: OSAllocatedUnfairLock<[Result<Value, AppError>]>
    private let counter = OSAllocatedUnfairLock(initialState: 0)

    init(_ results: [Result<Value, AppError>]) {
        self.results = OSAllocatedUnfairLock(initialState: results)
    }

    convenience init(just value: Value) { self.init([.success(value)]) }
    convenience init(failing error: AppError) { self.init([.failure(error)]) }

    var calls: Int { counter.withLock { $0 } }

    func next() -> Result<Value, AppError> {
        counter.withLock { $0 += 1 }
        return results.withLock { queue in
            queue.count > 1 ? queue.removeFirst() : queue[0]
        }
    }
}

/// Una puerta que deja a una llamada suspendida hasta que la prueba la abre.
final class Gate: Sendable {
    private let stream: AsyncStream<Void>
    private let continuation: AsyncStream<Void>.Continuation

    init() {
        (stream, continuation) = AsyncStream.makeStream(of: Void.self)
    }

    func wait() async {
        for await _ in stream { return }
    }

    func open() { continuation.yield() }
}

struct StubCatalog: CatalogRepository {
    var businesses = Script<[BusinessSummary]>([])
    var menus = Script<BusinessMenu>(failing: .network)
    var gate: Gate?

    func listBusinesses() async throws(AppError) -> [BusinessSummary] {
        let result = businesses.next()
        await gate?.wait()
        return try result.get()
    }

    func getBusiness(id: String) async throws(AppError) -> BusinessMenu {
        let result = menus.next()
        await gate?.wait()
        return try result.get()
    }
}

/// Un reloj que solo avanza cuando la prueba lo dice: `advance` mueve la hora y despierta a quien duerme en `sleep`.
/// Cuenta las veces que alguien se pone a dormir: `waitForSleep(number:)` deja a la prueba esperar, sin tiempo real,
/// a que el bucle que se está probando llegue (otra vez) a dormir, que es cuando ya terminó de reaccionar al último
/// despertar.
final class ManualClock: Sendable {
    private struct State {
        var date: Date
        var sleeps = 0
        var waiters: [(number: Int, continuation: CheckedContinuation<Void, Never>)] = []
    }

    private let state: OSAllocatedUnfairLock<State>
    private let ticks: AsyncStream<Void>
    private let continuation: AsyncStream<Void>.Continuation

    init(_ start: Date) {
        state = OSAllocatedUnfairLock(initialState: State(date: start))
        (ticks, continuation) = AsyncStream.makeStream(of: Void.self)
    }

    var clock: AppClock {
        AppClock(
            now: { self.state.withLock { $0.date } },
            sleep: { _ in
                self.didStartSleeping()
                for await _ in self.ticks { return }
                throw CancellationError()
            }
        )
    }

    private func didStartSleeping() {
        let ready = state.withLock { state -> [CheckedContinuation<Void, Never>] in
            state.sleeps += 1
            let due = state.waiters.filter { $0.number <= state.sleeps }.map(\.continuation)
            state.waiters.removeAll { $0.number <= state.sleeps }
            return due
        }
        ready.forEach { $0.resume() }
    }

    /// Vuelve cuando se han hecho al menos `number` llamadas a `sleep` (la 1.ª es la primera vez que alguien duerme).
    func waitForSleep(number: Int) async {
        await withCheckedContinuation { continuation in
            let alreadyThere = state.withLock { state -> Bool in
                if state.sleeps >= number { return true }
                state.waiters.append((number, continuation))
                return false
            }
            if alreadyThere { continuation.resume() }
        }
    }

    func advance(by seconds: TimeInterval) {
        state.withLock { $0.date = $0.date.addingTimeInterval(seconds) }
        continuation.yield()
    }

    func set(_ new: Date) {
        state.withLock { $0.date = new }
        continuation.yield()
    }
}

/// Espera, cediendo el turno, a que una condición se cumpla. Falla (con `Issue`) si no llega en un tiempo razonable.
/// Es para lo que ocurre en otro actor (el almacén de la bolsa) y no deja una señal que esperar; lo que depende del
/// reloj usa `ManualClock.waitForSleep`.
@MainActor
func eventually(
    _ message: String = "la condición no se cumplió",
    sourceLocation: SourceLocation = #_sourceLocation,
    _ condition: () -> Bool
) async {
    for _ in 0..<2_000 {
        if condition() { return }
        try? await Task.sleep(for: .milliseconds(2))
    }
    Issue.record(Comment(rawValue: message), sourceLocation: sourceLocation)
}

func summary(
    _ id: String,
    capability: PrimaryCapability? = nil,
    open: Bool? = true,
    name: String? = nil
) -> BusinessSummary {
    BusinessSummary(
        id: id, slug: id, name: name ?? "Negocio \(id)", accentColor: "F97316", primaryCapability: capability,
        estimatedEtaMin: 20, estimatedEtaMax: 35, isOpenNow: open
    )
}
