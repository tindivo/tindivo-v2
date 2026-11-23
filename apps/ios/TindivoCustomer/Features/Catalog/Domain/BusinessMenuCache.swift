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

    private var entries: [String: (menu: BusinessMenu, at: Date)] = [:]
    /// Las peticiones en curso, una por negocio: si Inicio y Negocio piden la misma carta a la vez, viaja una sola.
    private var inFlight: [String: Task<Result<BusinessMenu, AppError>, Never>] = [:]

    /// El id llega como uuid o como slug y con la mayúscula que sea: la clave no distingue mayúsculas.
    private static func key(_ id: String) -> String { id.lowercased() }

    /// La carta de `id`: la guardada si aún no caducó, la que ya se está pidiendo, o una nueva. Un error no se guarda.
    func menu(id: String, catalog: any CatalogRepository, now: Date) async throws(AppError) -> BusinessMenu {
        let key = Self.key(id)
        if let entry = entries[key], now.timeIntervalSince(entry.at) < Self.lifetime, now >= entry.at {
            return entry.menu
        }
        if let running = inFlight[key] { return try await running.value.get() }
        let task = Task { () async -> Result<BusinessMenu, AppError> in
            do throws(AppError) { return .success(try await catalog.getBusiness(id: id)) } catch {
                return .failure(error)
            }
        }
        inFlight[key] = task
        let result = await task.value
        inFlight[key] = nil
        if case let .success(menu) = result { entries[key] = (menu, now) }
        return try result.get()
    }

    /// La carta que acaba de bajar una pantalla (una recarga explícita): las demás la reusan.
    func store(_ menu: BusinessMenu, id: String, now: Date) {
        entries[Self.key(id)] = (menu, now)
    }
}
