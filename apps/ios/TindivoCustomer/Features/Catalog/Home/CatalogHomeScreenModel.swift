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

    private let catalog: any CatalogRepository
    private var inFlight = false

    init(catalog: any CatalogRepository) {
        self.catalog = catalog
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
            state = .loaded(Loaded(listing: HomeMapping.listing(from: businesses)))
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
