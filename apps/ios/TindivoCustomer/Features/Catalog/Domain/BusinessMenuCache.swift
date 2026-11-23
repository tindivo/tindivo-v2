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

    /// La carta de `id`: la guardada si aún no caducó, y si no, la pide a `catalog` y la guarda. Un error no se guarda.
    func menu(id: String, catalog: any CatalogRepository, now: Date) async throws(AppError) -> BusinessMenu {
        if let entry = entries[id], now.timeIntervalSince(entry.at) < Self.lifetime, now >= entry.at {
            return entry.menu
        }
        let menu = try await catalog.getBusiness(id: id)
        entries[id] = (menu, now)
        return menu
    }

    /// La carta que acaba de bajar una pantalla (una recarga explícita): las demás la reusan.
    func store(_ menu: BusinessMenu, id: String, now: Date) {
        entries[id] = (menu, now)
    }
}
