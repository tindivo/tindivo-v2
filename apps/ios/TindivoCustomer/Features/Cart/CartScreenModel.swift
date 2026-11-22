import Foundation
import Observation

/// Una opción elegida de un plato, para enseñarla como «Grupo: Opción».
struct CartOptionText: Equatable {
    let group: String
    let option: String
}

/// Una línea de la bolsa, ya decidida: los importes son texto para mostrar, nunca para calcular.
struct CartLineRow: Equatable {
    let signature: String
    let name: String
    let options: [CartOptionText]
    let note: String?
    let quantity: Int
    let total: String
    /// Con 1 unidad el «−» está deshabilitado: para quitar el plato está «Quitar».
    let canDecrease: Bool
    let canIncrease: Bool
}

/// Bolsa: las líneas de lo que se va a pedir, con su subtotal. La bolsa vive en `CartStore`; aquí solo se enseña y se
/// le mandan los cambios.
@MainActor
@Observable
final class CartScreenModel {
    struct Filled: Equatable {
        let businessId: String
        let businessName: String
        let lines: [CartLineRow]
        let subtotal: String
    }

    enum State: Equatable {
        /// Aún no se leyó lo guardado: no se enseña «vacía» por un instante.
        case loading
        case empty
        case filled(Filled)
    }

    private(set) var state: State = .loading

    private let store: any CartStore

    init(store: any CartStore) {
        self.store = store
    }

    /// La bolsa vigente ahora y después cada vez que cambia. Se lanza con `.task`.
    func observe() async {
        for await cart in await store.updates() {
            state = Self.state(for: cart)
        }
    }

    /// Suma o resta una unidad a la línea; se queda dentro de 1...50. Parte de lo guardado y no de lo que se ve: dos
    /// toques seguidos, antes de que la pantalla se actualice, suman dos veces.
    func changeQuantity(signature: String, by delta: Int) async {
        guard let line = await store.current()?.lines.first(where: { $0.signature == signature }) else { return }
        await write { store async throws(CartError) in
            try await store.setQuantity(signature: signature, quantity: line.quantity + delta)
        }
    }

    func remove(signature: String) async {
        await write { store async throws(CartError) in try await store.remove(signature: signature) }
    }

    func clear() async {
        await write { store async throws(CartError) in try await store.clear() }
    }

    /// Si no se puede escribir en el teléfono, la bolsa se queda como estaba y la pantalla sigue mostrándola.
    private func write(_ change: (any CartStore) async throws(CartError) -> Void) async {
        do throws(CartError) {
            try await change(store)
        } catch {
            // La bolsa que se ve es la que está guardada: no hay nada que deshacer.
        }
    }

    static func state(for cart: Cart?) -> State {
        guard let cart, !cart.isEmpty else { return .empty }
        return .filled(Filled(
            businessId: cart.businessId,
            businessName: cart.businessName,
            lines: cart.lines.map { line in
                CartLineRow(
                    signature: line.signature,
                    name: line.name,
                    options: line.modifiers.map { CartOptionText(group: $0.groupName, option: $0.optionName) },
                    note: line.note,
                    quantity: line.quantity,
                    total: formatAmount(line.total) ?? formatSoles(line.total),
                    canDecrease: line.quantity > 1,
                    canIncrease: line.quantity < CartLimits.maxQuantity
                )
            },
            subtotal: formatAmount(cart.subtotal) ?? formatSoles(cart.subtotal)
        ))
    }
}
