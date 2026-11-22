import Foundation
import Observation

/// La pila de navegación de la app: la única que sabe cómo se llega de una pantalla a otra. Las pantallas piden
/// «abre el negocio», «vuelve a la carta», no manipulan la pila.
@MainActor
@Observable
final class AppNavigator {
    var path: [AppRoute] = []

    func openBusiness(_ id: String) {
        path.append(.business(id: id))
    }

    func openCart() {
        path.append(.cart)
    }

    #if DEBUG
    func openDiagnostics() {
        path.append(.diagnostics)
    }
    #endif

    /// «+ Agregar más» de la bolsa: vuelve a la carta del negocio de la bolsa. Si esa carta está en la pila, se cierra
    /// todo lo que hay encima; si no (la bolsa se abrió de otro modo), se empuja.
    func addMore(to businessId: String) {
        if let index = path.lastIndex(where: { $0.isBusiness(businessId) }) {
            path.removeSubrange((index + 1)...)
        } else {
            openBusiness(businessId)
        }
    }

    /// «Ver negocios»: de vuelta a Inicio, la raíz.
    func seeBusinesses() {
        path.removeAll()
    }
}

private extension AppRoute {
    func isBusiness(_ id: String) -> Bool {
        if case let .business(own) = self { return own.caseInsensitiveCompare(id) == .orderedSame }
        return false
    }
}
