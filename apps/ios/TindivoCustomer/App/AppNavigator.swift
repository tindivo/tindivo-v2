import Foundation
import Observation

/// La pila de navegación de la app: la única que sabe cómo se llega de una pantalla a otra. Las pantallas piden
/// «abre el negocio», «vuelve a la carta», no manipulan la pila.
@MainActor
@Observable
final class AppNavigator {
    var path: [AppRoute] = []

    /// Los nombres con que se llegó a un negocio (su slug) y el id que resultó ser, ya normalizados. La ruta lleva lo
    /// que se pidió (id o slug); la bolsa guarda el id: hay que poder decir que son el mismo negocio.
    private var aliases: [String: String] = [:]

    func openBusiness(_ id: String) {
        // Un segundo toque sobre la misma tarjeta, o un enlace al negocio que ya se ve, no apila otra carta igual.
        if case let .business(top)? = path.last, canonical(top) == canonical(id) { return }
        path.append(.business(id: id))
    }

    /// La carta de `routeId` (id o slug) cargó y su id real es `businessId`: desde ahora se reconocen como uno.
    func learn(routeId: String, businessId: String) {
        aliases[Self.normalize(routeId)] = Self.normalize(businessId)
    }

    /// El identificador canónico de un negocio: sin espacios ni mayúsculas (Postgres devuelve los uuid en minúscula) y,
    /// si ya se sabe a qué id corresponde un slug, ese id.
    func canonical(_ idOrSlug: String) -> String {
        let key = Self.normalize(idOrSlug)
        return aliases[key] ?? key
    }

    private static func normalize(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
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
        if let index = path.lastIndex(where: { route in
            if case let .business(own) = route { canonical(own) == canonical(businessId) } else { false }
        }) {
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
