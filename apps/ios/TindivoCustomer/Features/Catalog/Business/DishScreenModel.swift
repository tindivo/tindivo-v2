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
        /// Se estaba editando una línea que ya no está en la bolsa.
        case lineGone
    }

    /// Lo que la pantalla hace con un resultado de «Agregar» (ver `resolveOutcome`).
    enum Resolution: Equatable {
        /// Se agregó: la carta cierra la ficha y enseña su aviso.
        case added(capped: Bool)
        /// La línea que se editaba ya no está en la bolsa: la ficha se cierra.
        case lineGone
        /// Nada que hacer en la ficha (el aviso, si lo había, ya se encendió, o falta que la persona decida).
        case stay
    }

    /// La bolsa es de otro restaurante y hay que preguntar si se vacía.
    struct Replacement: Equatable {
        let current: String
        let new: String
    }

    /// Un toque en «Elige [grupo]»: la pantalla lleva la vista al grupo y lo sacude. `serial` distingue dos toques
    /// seguidos sobre el mismo grupo.
    struct Attention: Equatable {
        let groupID: String
        let serial: Int
    }

    let item: MenuItem
    private(set) var attention: Attention?
    private var attentionSerial = 0
    private(set) var selection: DishSelection
    private(set) var outcome: Outcome?
    private(set) var isAdding = false
    /// Los avisos que se quedan en la ficha (bolsa llena, error al guardar).
    let notices: TimedNotice

    private let businessId: String
    private let businessName: String
    private let cartStore: any CartStore
    private var pending: CartLine?
    /// La línea de la bolsa que se está editando («Editar»); `nil` al agregar un plato.
    private let editing: CartLine?

    var isEditing: Bool { editing != nil }

    init(
        item: MenuItem, businessId: String, businessName: String, cartStore: any CartStore, clock: AppClock,
        editing: CartLine? = nil
    ) {
        self.item = item
        self.businessId = businessId
        self.businessName = businessName
        self.cartStore = cartStore
        self.editing = editing
        selection = editing.map { DishSelection(dish: item.dish, restoring: $0) } ?? DishSelection(dish: item.dish)
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

    // MARK: Lo que dice la pantalla

    /// El primer grupo obligatorio sin resolver, en el orden de la ficha.
    var firstMissingGroup: DishGroup? {
        item.dish.groups.first { group in
            let progress = selection.progress(of: group)
            return progress.required && !progress.done
        }
    }

    /// «1 de 2 listas»: los grupos obligatorios resueltos sobre los obligatorios del plato (CA-CAT-P8). `nil` si el plato
    /// no tiene ninguno.
    var progressText: String? {
        let required = item.dish.groups.filter(\.isRequired)
        guard !required.isEmpty else { return nil }
        let done = required.filter { selection.progress(of: $0).done }.count
        return String(localized: "\(done) de \(required.count) listas")
    }

    /// El botón de abajo: «Agregar · S/ 49.00», o «Elige [grupo]» con el grupo obligatorio que falta (CUS-CAT-033).
    var ctaTitle: String {
        switch selection.cta {
        case let .add(total):
            isEditing ? String(localized: "Guardar cambios · \(total)") : String(localized: "Agregar · \(total)")
        case .complete:
            if let group = firstMissingGroup {
                String(localized: "Elige: \(group.name)")
            } else {
                String(localized: "Revisa tus opciones")
            }
        }
    }

    /// Falta algo por elegir: el botón se ve apagado pero se puede tocar, para llevar al grupo que falta.
    var ctaBlocked: Bool { !canAdd }

    /// «Obligatorio · elige 1», «Listo» u «Opcional · hasta 2».
    func statusText(for group: DishGroup) -> String {
        let progress = selection.progress(of: group)
        if progress.required {
            return progress.done
                ? String(localized: "Listo")
                : String(localized: "Obligatorio · elige \(max(1, group.minSelections))")
        }
        guard !group.isSingle, let max = progress.max else { return String(localized: "Opcional") }
        return String(localized: "Opcional · hasta \(max)")
    }

    /// El contador de un grupo de varias opciones con tope: «2/3» a la vista y «2 de 3 elegidas» para VoiceOver.
    func counter(for group: DishGroup) -> (text: String, spoken: String)? {
        guard !group.isSingle, let max = group.maxSelections else { return nil }
        let count = selection.progress(of: group).count
        return ("\(count)/\(max)", String(localized: "\(count) de \(max) elegidas"))
    }

    /// El contador de la nota: «12/140» a la vista y «12 de 140 caracteres» para VoiceOver.
    var noteCounter: (text: String, spoken: String) {
        let used = selection.note.utf16.count
        return (
            "\(used)/\(CartLimits.maxNoteLength)",
            String(localized: "\(used) de \(CartLimits.maxNoteLength) caracteres")
        )
    }

    /// Lo que VoiceOver anuncia al llevar la vista a un grupo («Falta elegir: Guarnición 2»).
    var attentionAnnouncement: String? {
        attention.flatMap { attention in item.dish.groups.first { $0.id == attention.groupID } }
            .map { String(localized: "Falta elegir: \($0.name)") }
    }

    /// Un toque en el botón de abajo: con algo obligatorio sin elegir lleva al grupo que falta; si no, agrega.
    func tapAdd() async {
        if let group = firstMissingGroup {
            attentionSerial += 1
            attention = Attention(groupID: group.id, serial: attentionSerial)
            return
        }
        await add()
    }

    /// La pregunta «¿Empezar una bolsa nueva?», mientras el resultado sea ese.
    var replacement: Replacement? {
        if case let .otherBusiness(current, new) = outcome { Replacement(current: current, new: new) } else { nil }
    }

    /// Consume el resultado de «Agregar» una sola vez: el aviso que se queda en la ficha se enciende, y «Añadido» lo
    /// devuelve para que la carta cierre la ficha. `otherBusiness` no se consume: espera la decisión.
    func resolveOutcome() -> Resolution {
        guard let outcome else { return .stay }
        switch outcome {
        case let .added(capped):
            consumeOutcome()
            return .added(capped: capped)
        case .full, .failed:
            showNotice(for: outcome)
            consumeOutcome()
            return .stay
        case .lineGone:
            consumeOutcome()
            return .lineGone
        case .otherBusiness:
            return .stay
        }
    }

    // MARK: Agregar

    /// Un segundo toque mientras se guarda el primero no suma otra vez.
    func add() async {
        guard !isAdding, let line = selection.toLine() else { return }
        isAdding = true
        defer { isAdding = false }
        do throws(CartError) {
            if let editing {
                switch try await cartStore.replaceLine(signature: editing.signature, with: line) {
                case let .replaced(capped): outcome = .added(capped: capped)
                case .notFound: outcome = .lineGone
                }
                return
            }
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
        case .full: notices.show(Self.fullMessage)
        case .failed: notices.show(Self.failedMessage)
        case .added, .otherBusiness, .lineGone: break
        }
    }

    static var fullMessage: String {
        String(localized: "Tu bolsa ya tiene \(CartLimits.maxLines) platos distintos: es el máximo por pedido")
    }

    static var failedMessage: String { String(localized: "No se pudo guardar tu bolsa. Inténtalo de nuevo.") }

    static func addedMessage(capped: Bool) -> String {
        capped
            ? String(localized: "Ya tienes \(CartLimits.maxQuantity) de este plato: es el máximo por pedido")
            : String(localized: "Añadido a tu bolsa")
    }
}
