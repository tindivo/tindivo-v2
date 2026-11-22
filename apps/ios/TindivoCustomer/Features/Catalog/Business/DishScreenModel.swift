import Foundation
import Observation

/// Plato: lo que la persona elige de un plato (opciones, nota, cantidad) y qué pasa al agregarlo a la bolsa. Las
/// reglas de la selección son las de `DishSelection`; aquí solo se envuelven en estado de pantalla.
@MainActor
@Observable
final class DishScreenModel {
    /// El resultado de pulsar «Agregar»; la pantalla lo consume una sola vez.
    enum Outcome: Equatable {
        /// `capped`: la cantidad pedida no cabía y la línea se quedó en el máximo.
        case added(capped: Bool)
        /// La bolsa es de otro restaurante: la persona decide si la vacía.
        case otherBusiness(currentBusinessName: String, newBusinessName: String)
        /// La bolsa ya tiene el máximo de platos distintos del pedido; no se añadió.
        case full
        /// No se pudo guardar en el teléfono.
        case failed
    }

    let item: MenuItem
    private(set) var selection: DishSelection
    private(set) var outcome: Outcome?
    private(set) var isAdding = false
    /// Los avisos que se quedan en la ficha (bolsa llena, error al guardar).
    let notices: TimedNotice

    private let businessId: String
    private let businessName: String
    private let cartStore: any CartStore
    private var pending: CartLine?

    init(item: MenuItem, businessId: String, businessName: String, cartStore: any CartStore, clock: AppClock) {
        self.item = item
        self.businessId = businessId
        self.businessName = businessName
        self.cartStore = cartStore
        selection = DishSelection(dish: item.dish)
        notices = TimedNotice(clock: clock)
    }

    // MARK: Lo que se elige

    func toggle(_ option: DishOption, in group: DishGroup) {
        selection = selection.toggling(option, in: group)
    }

    func setNote(_ raw: String) {
        selection = selection.withNote(raw)
    }

    func setQuantity(_ value: Int) {
        selection = selection.withQuantity(value)
    }

    var canDecrease: Bool { selection.quantity > 1 }
    var canIncrease: Bool { selection.quantity < CartLimits.maxQuantity }
    var canAdd: Bool { selection.isValid }

    // MARK: Agregar

    /// Un segundo toque mientras se guarda el primero no suma otra vez.
    func add() async {
        guard !isAdding, let line = selection.toLine() else { return }
        isAdding = true
        defer { isAdding = false }
        do throws(CartError) {
            switch try await cartStore.add(businessId: businessId, businessName: businessName, line: line) {
            case let .added(_, capped):
                pending = nil
                outcome = .added(capped: capped)
            case let .otherBusiness(current):
                pending = line
                outcome = .otherBusiness(currentBusinessName: current, newBusinessName: businessName)
            case .full:
                pending = nil
                outcome = .full
            }
        } catch {
            outcome = .failed
        }
    }

    /// La persona aceptó vaciar la bolsa del otro restaurante: toma la línea pendiente EN EL ACTO (síncrono, antes de
    /// que nada pueda consumirla) y después lanza la escritura. Devuelve la tarea para quien quiera esperarla.
    @discardableResult
    func confirmReplace() -> Task<Void, Never>? {
        guard !isAdding, let line = pending else { return nil }
        pending = nil
        outcome = nil
        isAdding = true
        return Task { await write(replacing: line) }
    }

    private func write(replacing line: CartLine) async {
        defer { isAdding = false }
        do throws(CartError) {
            try await cartStore.replace(businessId: businessId, businessName: businessName, line: line)
            outcome = .added(capped: false)
        } catch {
            outcome = .failed
        }
    }

    /// «Mantener»: la bolsa del otro restaurante se queda y la línea pendiente se descarta.
    func keepCurrentBag() {
        pending = nil
        outcome = nil
    }

    /// La pantalla ya mostró el resultado. No toca `pending`: cerrar el diálogo nunca pierde la línea pendiente.
    func consumeOutcome() {
        outcome = nil
    }

    /// Los avisos de «Agregar» que no cierran la ficha se enseñan en ella; «Añadido» lo enseña la carta.
    func showNotice(for outcome: Outcome) {
        switch outcome {
        case .full: notices.show(String(localized: "Tu bolsa ya tiene \(CartLimits.maxLines) platos distintos: es el máximo por pedido"))
        case .failed: notices.show(String(localized: "No se pudo guardar tu bolsa. Inténtalo de nuevo."))
        case .added, .otherBusiness: break
        }
    }

    static func addedMessage(capped: Bool) -> String {
        capped
            ? String(localized: "Ya tienes \(CartLimits.maxQuantity) de este plato: es el máximo por pedido")
            : String(localized: "Añadido a tu bolsa")
    }
}
