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
    /// Hubo un 426 en la última carga: la pantalla de actualización es de otra fase, la raíz lo leerá de aquí.
    private(set) var upgradeNotice: UpgradeNotice?

    /// Las unidades de la bolsa, para el contador de la barra superior (CUS-CAT-030).
    private(set) var bagCount = 0
    /// Por cada negocio cerrado de la lista, «Cerrado · abre mañana 12:00» (CA-CAT-P2). La lista no trae cuándo abre:
    /// se arma con el horario de su carta, y mientras llega la tarjeta dice «Cerrado ahora».
    private(set) var closedLabels: [String: String] = [:]
    /// La dirección de entrega del chip «Entregar en». La app aún no tiene sesión ni direcciones: es `nil` y el chip no
    /// se muestra (ficha de Inicio: «sin sesión o sin dirección, el chip no se muestra»).
    private(set) var deliveryAddress: String?

    private let catalog: any CatalogRepository
    private let cartStore: (any CartStore)?
    private let clock: AppClock
    private var inFlight = false
    private var enrichment: Task<Void, Never>?

    init(catalog: any CatalogRepository, cartStore: (any CartStore)? = nil, clock: AppClock = .live) {
        self.catalog = catalog
        self.cartStore = cartStore
        self.clock = clock
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

    /// El texto de estado de una tarjeta cerrada.
    func closedLabel(for business: BusinessCard) -> String {
        closedLabels[business.id] ?? OrderingMode.closedTitle
    }

    /// Espera a que termine el armado de los textos «abre …» (para las pruebas).
    func waitForClosedLabels() async {
        await enrichment?.value
    }

    private func loadClosedLabels(for cards: [BusinessCard]) {
        enrichment?.cancel()
        let catalog = catalog
        let now = clock.now()
        enrichment = Task { [weak self] in
            let labels = await withTaskGroup(of: (String, String)?.self) { group in
                for card in cards where card.closed {
                    group.addTask {
                        guard let menu = try? await catalog.getBusiness(id: card.id),
                              let detail = MenuMapping.detail(from: menu),
                              case let .closed(status) = openStatus(
                                  days: detail.schedule, now: now, openingConfirmed: detail.openingConfirmed
                              )
                        else { return nil }
                        return (card.id, closedSummary(status, now: now))
                    }
                }
                var result: [String: String] = [:]
                for await pair in group { if let pair { result[pair.0] = pair.1 } }
                return result
            }
            guard !Task.isCancelled else { return }
            self?.closedLabels = labels
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
            upgradeNotice = nil
            let listing = HomeMapping.listing(from: businesses)
            state = .loaded(Loaded(listing: listing))
            loadClosedLabels(for: listing.restaurants + listing.whatsapp)
        } catch .cancelled {
            state = previous.map { .loaded(Loaded(listing: $0.listing)) } ?? .idle
        } catch {
            upgradeNotice = UpgradeNotice(error)
            state = previous.map { .loaded(Loaded(listing: $0.listing, refreshFailed: error)) } ?? .failed(error)
        }
    }

    private var loaded: Loaded? {
        if case let .loaded(loaded) = state { loaded } else { nil }
    }
}
