import Foundation
import Observation

/// Una opción elegida de un plato, para enseñarla como «Grupo: Opción».
struct CartOptionText: Equatable, Identifiable {
    /// Identidad en la lista: dos grupos pueden tener una opción con el mismo nombre, pero no el mismo `optionId`.
    let id: String
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
    /// Con 1 unidad el «−» quita la línea (CUS-CRT-003): no baja de 1.
    let decreaseRemoves: Bool
    let canIncrease: Bool

    /// Identidad en la lista: unidades UTF-16 (como `CartLine.signatureKey`), no la igualdad canónica de `String`.
    var signatureKey: [UInt16] { Array(signature.utf16) }
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

    /// Suma o resta una unidad a la línea; se queda dentro de 1...50. La suma la hace la bolsa sobre lo guardado (una
    /// sola operación): dos toques seguidos, antes de que la pantalla se actualice, suman dos veces. Con 1 unidad,
    /// restar quita la línea (CUS-CRT-003); lo que decide eso es la fila que se ve, y si estaba desfasada la bolsa
    /// nunca baja de 1 por restar.
    func changeQuantity(signature: String, by delta: Int) async {
        if delta < 0, displayedQuantity(of: signature) == 1 {
            await remove(signature: signature)
            return
        }
        await write { store async throws(CartError) in try await store.changeQuantity(signature: signature, by: delta) }
    }

    func remove(signature: String) async {
        await write { store async throws(CartError) in try await store.remove(signature: signature) }
    }

    private func displayedQuantity(of signature: String) -> Int? {
        guard case let .filled(filled) = state else { return nil }
        return filled.lines.first { $0.signatureKey == Array(signature.utf16) }?.quantity
    }

    func clear() async {
        await write { store async throws(CartError) in try await store.clear() }
    }

    /// Si no se puede escribir en el teléfono, la bolsa se queda como estaba y la pantalla sigue mostrándola.
    private func write<Output>(_ change: (any CartStore) async throws(CartError) -> Output) async {
        do throws(CartError) {
            _ = try await change(store)
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
                    options: line.modifiers.map { CartOptionText(id: $0.optionId, group: $0.groupName, option: $0.optionName) },
                    note: line.note,
                    quantity: line.quantity,
                    total: formatAmount(line.total) ?? formatSoles(line.total),
                    decreaseRemoves: line.quantity == 1,
                    canIncrease: line.quantity < CartLimits.maxQuantity
                )
            },
            subtotal: formatAmount(cart.subtotal) ?? formatSoles(cart.subtotal)
        ))
    }
}
