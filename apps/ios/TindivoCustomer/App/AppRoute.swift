import Foundation

/// Las pantallas a las que se llega empujando (SW-11). Inicio es la raíz y no tiene ruta; el plato no es una ruta:
/// se presenta sobre el negocio.
enum AppRoute: Hashable {
    /// `id` es el uuid del negocio (o su slug: la API acepta los dos).
    case business(id: String)
    case cart
    #if DEBUG
    case diagnostics
    #endif
}
