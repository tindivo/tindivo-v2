import Foundation
import Observation
import TindivoAPI

/// Inicio: la lista de negocios, separados entre los que se piden por la plataforma y los que solo enseñan su carta.
@MainActor
@Observable
final class CatalogHomeScreenModel {
    /// Lo que se ve con la lista cargada. `refreshFailed` es el error de una recarga que no borró la lista.
    struct Loaded: Equatable {
        var listing: HomeListing
        var refreshing = false
        var refreshFailed: AppError?
    }

    enum State: Equatable {
        /// Aún no se pidió nada (o la pantalla se fue a medio camino): se ve igual que `loading`.
        case idle
        case loading
        case loaded(Loaded)
        case failed(AppError)
    }

    private(set) var state: State = .idle

    /// Las unidades de la bolsa, para el contador de la barra superior (CUS-CAT-030).
    private(set) var bagCount = 0
    /// El horario de la carta de cada negocio cerrado de la lista. La lista no trae cuándo abre (CUS-CAT-023, del
    /// servidor): se arma con el horario de su carta, y mientras llega la tarjeta dice «Cerrado ahora».
    private(set) var schedules: [String: ClosedSchedule] = [:]
    /// «Ahora»: se vuelve a leer cada minuto, para que «Cerrado · abre hoy 18:00» cambie solo.
    private(set) var now: Date
    /// La dirección de entrega del chip «Entregar en». La app aún no tiene sesión ni direcciones: es `nil` y el chip no
    /// se muestra (ficha de Inicio: «sin sesión o sin dirección, el chip no se muestra»).
    private(set) var deliveryAddress: String?

    private let catalog: any CatalogRepository
    private let cartStore: (any CartStore)?
    private let clock: AppClock
    private let menuCache: BusinessMenuCache
    private var inFlight = false
    /// El armado de los textos «abre …»; las pruebas lo esperan.
    @ObservationIgnored private(set) var enrichment: Task<Void, Never>?

    /// Cada cuánto se vuelve a decidir qué dice una tarjeta cerrada.
    static let recheckEvery = Duration.seconds(60)
    /// Cuántas cartas se piden a la vez para armar los textos de las tarjetas cerradas.
    static let maxConcurrentMenus = 3

    /// El horario de un negocio cerrado, tal como lo manda su carta.
    struct ClosedSchedule: Equatable {
        let days: [ScheduleDay]
        let openingConfirmed: Bool?
    }

    init(
        catalog: any CatalogRepository, cartStore: (any CartStore)? = nil, clock: AppClock = .live,
        menuCache: BusinessMenuCache = BusinessMenuCache()
    ) {
        self.catalog = catalog
        self.cartStore = cartStore
        self.clock = clock
        self.menuCache = menuCache
        now = clock.now()
    }

    /// Reevalúa cada minuto qué dicen las tarjetas cerradas. Se lanza con `.task`: dura lo que la pantalla esté a la vista.
    func runClock() async {
        now = clock.now()
        while !Task.isCancelled {
            do { try await clock.sleep(Self.recheckEvery) } catch { return }
            now = clock.now()
        }
    }

    /// La bolsa vigente ahora y después cada vez que cambia. Se lanza con `.task`.
    func observeCart() async {
        guard let cartStore else { return }
        for await current in await cartStore.updates() {
            bagCount = current?.count ?? 0
        }
    }

    /// Lo que lee VoiceOver en el botón de la bolsa: «Bolsa» o «Bolsa, 3 productos».
    var bagAccessibilityLabel: String {
        bagCount == 0 ? String(localized: "Bolsa") : String(localized: "Bolsa, \(bagCount) productos")
    }

    /// El número de la insignia: más de 99 se muestra «99+».
    var bagBadgeText: String? {
        bagCount == 0 ? nil : (bagCount > 99 ? "99+" : "\(bagCount)")
    }

    /// El texto de estado de una tarjeta cerrada: «Cerrado · abre mañana 12:00», o «Cerrado ahora» si aún no se sabe.
    func closedLabel(for business: BusinessCard) -> String {
        guard let schedule = schedules[business.id],
              case let .closed(status) = openStatus(
                  days: schedule.days, now: now, openingConfirmed: schedule.openingConfirmed
              )
        else { return OrderingMode.closedTitle }
        return closedSummary(status, now: now)
    }

    /// workaround: Inicio baja la carta de cada negocio cerrado para saber cuándo abre, porque `listBusinesses` no manda
    /// `next_change_at` (CUS-CAT-023, del servidor). Pide como mucho `maxConcurrentMenus` a la vez y comparte la caché
    /// con Negocio. Un error en una carta deja esa tarjeta en «Cerrado ahora».
    private func loadClosedSchedules(for cards: [BusinessCard]) {
        enrichment?.cancel()
        let ids = cards.filter(\.closed).map(\.id)
        let catalog = catalog
        let cache = menuCache
        let now = clock.now()
        enrichment = Task { [weak self] in
            let loaded = await withTaskGroup(of: (String, ClosedSchedule)?.self) { group in
                var pending = ids[...]
                func fetch(_ id: String) {
                    group.addTask {
                        guard let menu = try? await cache.menu(id: id, catalog: catalog, now: now),
                              let detail = MenuMapping.detail(from: menu) else { return nil }
                        return (id, ClosedSchedule(days: detail.schedule, openingConfirmed: detail.openingConfirmed))
                    }
                }
                for _ in 0..<min(Self.maxConcurrentMenus, ids.count) { if let id = pending.popFirst() { fetch(id) } }
                var result: [String: ClosedSchedule] = [:]
                for await pair in group {
                    if let pair { result[pair.0] = pair.1 }
                    if let id = pending.popFirst() { fetch(id) }
                }
                return result
            }
            guard !Task.isCancelled else { return }
            self?.schedules = loaded
        }
    }

    /// La primera carga de la pantalla; si ya hay lista no pide otra (volver desde un negocio no recarga).
    func load() async {
        switch state {
        case .idle, .failed: await refresh()
        case .loading, .loaded: break
        }
    }

    /// Vuelve a pedir la lista. Con una lista ya cargada la deja a la vista mientras recarga, y si la recarga falla
    /// la conserva y marca `refreshFailed`. Si ya hay una carga en curso, no lanza otra.
    func refresh() async {
        guard !inFlight else { return }
        inFlight = true
        defer { inFlight = false }
        let previous = loaded
        state = previous.map { .loaded(Loaded(listing: $0.listing, refreshing: true)) } ?? .loading
        do throws(AppError) {
            let businesses = try await catalog.listBusinesses()
            let listing = HomeMapping.listing(from: businesses)
            state = .loaded(Loaded(listing: listing))
            loadClosedSchedules(for: listing.restaurants + listing.whatsapp)
        } catch .cancelled {
            state = previous.map { .loaded(Loaded(listing: $0.listing)) } ?? .idle
        } catch {
            state = previous.map { .loaded(Loaded(listing: $0.listing, refreshFailed: error)) } ?? .failed(error)
        }
    }

    private var loaded: Loaded? {
        if case let .loaded(loaded) = state { loaded } else { nil }
    }
}
