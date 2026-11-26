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
    /// ¿La puerta también detiene las cartas? Inicio pide la carta de cada negocio por su cuenta y no debe quitarle la
    /// puerta a la lista.
    var gatesMenus = true

    func listBusinesses() async throws(AppError) -> [BusinessSummary] {
        let result = businesses.next()
        await gate?.wait()
        return try result.get()
    }

    func getBusiness(id: String) async throws(AppError) -> BusinessMenu {
        let result = menus.next()
        if gatesMenus { await gate?.wait() }
        return try result.get()
    }
}

/// Un reloj que solo avanza cuando la prueba lo dice. Quien duerme `sleep(duración)` se despierta cuando la hora
/// manual llega a su plazo (la hora en que se durmió más la duración), y solo entonces: ni antes ni por los tics de
/// otro. Cancelar la tarea que duerme la despierta con `CancellationError`, como el reloj de verdad.
///
/// Cuenta las veces que se durmió, por duración: `waitForSleep(number:of:)` deja a la prueba esperar, sin tiempo real,
/// a que el bucle que se está probando llegue (otra vez) a dormir, que es cuando ya terminó de reaccionar al último
/// despertar. El aviso «Agregado» (3 s) y el minuto de la carta no se mezclan.
final class ManualClock: Sendable {
    private struct Sleeper {
        let deadline: Date
        let continuation: CheckedContinuation<Void, any Error>
    }

    private struct Waiter {
        let duration: Duration
        let number: Int
        let continuation: CheckedContinuation<Void, Never>
    }

    private struct State {
        var date: Date
        var sleepers: [UUID: Sleeper] = [:]
        var sleeps: [Duration: Int] = [:]
        var waiters: [Waiter] = []
    }

    private let state: OSAllocatedUnfairLock<State>

    init(_ start: Date) {
        state = OSAllocatedUnfairLock(initialState: State(date: start))
    }

    var clock: AppClock {
        AppClock(
            now: { self.state.withLock { $0.date } },
            sleep: { duration in try await self.sleep(duration) }
        )
    }

    private func sleep(_ duration: Duration) async throws {
        let id = UUID()
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
                let outcome = state.withLock { state -> (cancelled: Bool, due: [CheckedContinuation<Void, Never>]) in
                    if Task.isCancelled { return (true, []) }
                    let seconds = Double(duration.components.seconds) + Double(duration.components.attoseconds) / 1e18
                    state.sleepers[id] = Sleeper(
                        deadline: state.date.addingTimeInterval(seconds), continuation: continuation)
                    state.sleeps[duration, default: 0] += 1
                    let count = state.sleeps[duration, default: 0]
                    let due = state.waiters.filter { $0.duration == duration && $0.number <= count }
                    state.waiters.removeAll { $0.duration == duration && $0.number <= count }
                    return (false, due.map(\.continuation))
                }
                if outcome.cancelled { continuation.resume(throwing: CancellationError()) }
                outcome.due.forEach { $0.resume() }
            }
        } onCancel: {
            let sleeper = state.withLock { $0.sleepers.removeValue(forKey: id) }
            sleeper?.continuation.resume(throwing: CancellationError())
        }
    }

    /// Cuántas veces se ha dormido `duration`.
    func sleeps(of duration: Duration) -> Int {
        state.withLock { $0.sleeps[duration, default: 0] }
    }

    /// Vuelve cuando alguien se ha puesto a dormir `duration` al menos `number` veces (la 1.ª es la primera vez). Por
    /// omisión, el minuto de la carta y de Inicio.
    func waitForSleep(number: Int, of duration: Duration = .seconds(60)) async {
        await withCheckedContinuation { continuation in
            let alreadyThere = state.withLock { state -> Bool in
                if state.sleeps[duration, default: 0] >= number { return true }
                state.waiters.append(Waiter(duration: duration, number: number, continuation: continuation))
                return false
            }
            if alreadyThere { continuation.resume() }
        }
    }

    func advance(by seconds: TimeInterval) {
        move { $0.addingTimeInterval(seconds) }
    }

    func set(_ new: Date) {
        move { _ in new }
    }

    /// Cambia la hora y despierta a quien ya cumplió su plazo.
    private func move(_ change: @Sendable (Date) -> Date) {
        let due = state.withLock { state -> [Sleeper] in
            state.date = change(state.date)
            let ready = state.sleepers.filter { $0.value.deadline <= state.date }
            ready.keys.forEach { state.sleepers.removeValue(forKey: $0) }
            return Array(ready.values)
        }
        due.forEach { $0.continuation.resume() }
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

/// Cartas que se quedan esperando hasta que la prueba las suelta: cuenta cuántas se pidieron, cuántas esperan a la vez
/// (y el máximo) y a cuántas las cancelaron. La lista de negocios responde de inmediato.
final class HeldMenus: CatalogRepository, Sendable {
    private struct State {
        var started = 0
        var waiting: [UUID: CheckedContinuation<Void, Never>] = [:]
        var peak = 0
        var cancelled = 0
        var listCalls = 0
    }

    private let state = OSAllocatedUnfairLock(initialState: State())
    private let businesses: [BusinessSummary]
    private let menu: BusinessMenu

    init(businesses: [BusinessSummary], menu: BusinessMenu) {
        self.businesses = businesses
        self.menu = menu
    }

    var menuCalls: Int { state.withLock { $0.started } }
    var listCalls: Int { state.withLock { $0.listCalls } }
    var waiting: Int { state.withLock { $0.waiting.count } }
    var peak: Int { state.withLock { $0.peak } }
    var cancelled: Int { state.withLock { $0.cancelled } }

    func listBusinesses() async throws(AppError) -> [BusinessSummary] {
        state.withLock { $0.listCalls += 1 }
        return businesses
    }

    func getBusiness(id: String) async throws(AppError) -> BusinessMenu {
        let token = UUID()
        await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                let cancelledAlready = state.withLock { state -> Bool in
                    state.started += 1
                    if Task.isCancelled {
                        state.cancelled += 1
                        return true
                    }
                    state.waiting[token] = continuation
                    state.peak = max(state.peak, state.waiting.count)
                    return false
                }
                if cancelledAlready { continuation.resume() }
            }
        } onCancel: {
            let continuation = state.withLock { state -> CheckedContinuation<Void, Never>? in
                guard let continuation = state.waiting.removeValue(forKey: token) else { return nil }
                state.cancelled += 1
                return continuation
            }
            continuation?.resume()
        }
        if Task.isCancelled { throw .cancelled }
        return menu
    }

    /// Suelta a todas las cartas que esperan.
    func releaseAll() {
        let all = state.withLock { state -> [CheckedContinuation<Void, Never>] in
            defer { state.waiting.removeAll() }
            return Array(state.waiting.values)
        }
        all.forEach { $0.resume() }
    }
}
