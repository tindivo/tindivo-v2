import Foundation
import TindivoAPI

/// Una caché en memoria de las cartas ya pedidas, compartida entre Inicio y Negocio: si Inicio ya bajó la carta de un
/// negocio para saber cuándo abre, al entrar a ese negocio se reusa en vez de pedirla otra vez. Vive lo que dura la
/// app y cada carta caduca a los 60 s, para no enseñar precios viejos.
///
/// workaround: existe porque `listBusinesses` no manda cuándo abre cada negocio cerrado (`next_change_at`,
/// CUS-CAT-023, es del servidor). Cuando el servidor lo mande, Inicio deja de pedir cartas y esto solo servirá a
/// Negocio.
actor BusinessMenuCache {
    static let lifetime: TimeInterval = 60

    private typealias Outcome = Result<BusinessMenu, AppError>

    /// La petición en curso de un negocio y quienes esperan su respuesta.
    private struct Flight {
        let token = UUID()
        var task: Task<Void, Never>?
        var waiters: [UUID: CheckedContinuation<Outcome, Never>] = [:]
    }

    private var entries: [String: (menu: BusinessMenu, at: Date)] = [:]
    /// Las peticiones en curso, una por negocio: si Inicio y Negocio piden la misma carta a la vez, viaja una sola. Si
    /// todos los que esperan se van (cancelación), la petición se cancela.
    private var flights: [String: Flight] = [:]

    /// El id llega como uuid o como slug y con la mayúscula que sea: la clave no distingue mayúsculas.
    private static func key(_ id: String) -> String { id.lowercased() }

    /// La carta de `id`: la guardada si aún no caducó, la que ya se está pidiendo, o una nueva. Un error no se guarda.
    /// Quien espera y se cancela vuelve al instante con `.cancelled`; la petición sigue mientras quede alguien.
    func menu(id: String, catalog: any CatalogRepository, now: Date) async throws(AppError) -> BusinessMenu {
        let key = Self.key(id)
        if let entry = entries[key], now.timeIntervalSince(entry.at) < Self.lifetime, now >= entry.at {
            return entry.menu
        }
        let waiter = UUID()
        let outcome = await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<Outcome, Never>) in
                if Task.isCancelled { return continuation.resume(returning: .failure(.cancelled)) }
                join(key: key, waiter: waiter, continuation: continuation, id: id, catalog: catalog, now: now)
            }
        } onCancel: {
            Task { await self.leave(key: key, waiter: waiter) }
        }
        return try outcome.get()
    }

    /// Cuántos esperan hoy la carta de `id` (para las pruebas).
    func waiters(for id: String) -> Int { flights[Self.key(id)]?.waiters.count ?? 0 }

    private func join(
        key: String, waiter: UUID, continuation: CheckedContinuation<Outcome, Never>, id: String,
        catalog: any CatalogRepository, now: Date
    ) {
        var flight = flights[key] ?? Flight()
        flight.waiters[waiter] = continuation
        if flight.task == nil {
            let token = flight.token
            flight.task = Task {
                let outcome: Outcome
                do throws(AppError) { outcome = .success(try await catalog.getBusiness(id: id)) } catch {
                    outcome = .failure(error)
                }
                await self.finish(key: key, token: token, outcome: outcome, now: now)
            }
        }
        flights[key] = flight
    }

    private func finish(key: String, token: UUID, outcome: Outcome, now: Date) {
        // Si la petición se canceló y otra la reemplazó, esta respuesta ya no le toca a nadie.
        guard let flight = flights[key], flight.token == token else { return }
        flights[key] = nil
        if case let .success(menu) = outcome { store(menu, id: key, now: now) }
        flight.waiters.values.forEach { $0.resume(returning: outcome) }
    }

    private func leave(key: String, waiter: UUID) {
        guard var flight = flights[key], let continuation = flight.waiters.removeValue(forKey: waiter) else { return }
        continuation.resume(returning: .failure(.cancelled))
        if flight.waiters.isEmpty {
            flight.task?.cancel()
            flights[key] = nil
        } else {
            flights[key] = flight
        }
    }

    /// La carta que acaba de bajar una pantalla (una recarga explícita): las demás la reusan. Una respuesta más vieja
    /// que la guardada no la pisa.
    func store(_ menu: BusinessMenu, id: String, now: Date) {
        let key = Self.key(id)
        if let entry = entries[key], entry.at > now { return }
        entries[key] = (menu, now)
    }
}
