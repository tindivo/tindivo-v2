import Foundation

/// Cómo se enseña el precio de una opción. El texto de la cifra lo trae listo; `displayText` añade la palabra.
enum OptionPrice: Sendable, Equatable {
    /// Cuesta 0: «Incluido».
    case included
    /// «+S/ 2.50».
    case delta(String)
    /// El precio final del plato con esa opción («S/ 20.50»), cuando el grupo es `price_display = total`.
    case total(String)

    var displayText: String {
        switch self {
        case .included: String(localized: "Incluido")
        case let .delta(text): String(localized: "+\(text)")
        case let .total(text): text
        }
    }
}

/// Lo que el botón de la ficha dice: agregar con el total, o cuántas opciones faltan.
enum DishCTA: Sendable, Equatable {
    case add(total: String)
    case complete(missing: Int)
}

/// El avance de un grupo: lo que enseñan «Obligatorio», «Listo» y el contador. `max == nil` es sin tope.
struct GroupProgress: Sendable, Equatable {
    let required: Bool
    let done: Bool
    let single: Bool
    let count: Int
    let max: Int?
}

/// Lo que la persona ha elegido en la ficha de un plato, sin nada de UI: opciones, nota y cantidad. Es un valor
/// puro: cada cambio devuelve otro estado (la Fase 1·B lo envolverá en un modelo de pantalla). La validez es
/// `checkModifierSelection`, la misma regla que aplica el servidor al crear el pedido.
struct DishSelection: Sendable, Equatable {
    let dish: Dish
    var selectedIds: [String]
    var note: String
    var quantity: Int

    init(dish: Dish, selectedIds: [String] = [], note: String = "", quantity: Int = 1) {
        self.dish = dish
        self.selectedIds = selectedIds
        self.note = note
        self.quantity = quantity
    }

    /// La selección de una línea de la bolsa, para «Editar»: sus opciones (las que la carta aún tiene), su nota y su
    /// cantidad. Una opción que ya no existe se descarta y la selección queda incompleta hasta que se vuelva a elegir.
    init(dish: Dish, restoring line: CartLine) {
        let canonical = Dictionary(
            dish.groups.flatMap { $0.options.map { ($0.id.lowercased(), $0.id) } }, uniquingKeysWith: { first, _ in first }
        )
        self.init(
            dish: dish, selectedIds: line.modifiers.compactMap { canonical[$0.optionId.lowercased()] },
            note: line.note ?? "", quantity: line.quantity
        )
    }

    private var issues: [ModifierSelectionIssue] {
        let optionGroupOf = Dictionary(
            dish.groups.flatMap { group in group.options.map { ($0.id, group.id) } },
            uniquingKeysWith: { _, last in last }
        )
        let rules = dish.groups.map {
            ModifierGroupRule(
                id: $0.id, name: $0.name, selectionType: $0.selectionType, isRequired: $0.isRequired,
                minSelections: $0.minSelections, maxSelections: $0.maxSelections
            )
        }
        return checkModifierSelection(groups: rules, selectedOptionIds: selectedIds, optionGroupOf: optionGroupOf)
    }

    private var missingGroupIds: Set<String> {
        Set(issues.compactMap { issue in
            if case let .missing(groupId, _, _, _) = issue { groupId } else { nil }
        })
    }

    /// Cuántos grupos obligatorios faltan por completar.
    var missing: Int { missingGroupIds.count }

    /// Que cada id elegido sea UNA opción del plato: si no, el precio sumaría otra cosa que lo validado.
    var isValid: Bool {
        issues.isEmpty && selectedIds.count <= CartLimits.maxModifiers && selectedModifiers.count == selectedIds.count
    }

    private var selectedModifiers: [CartModifier] {
        let chosen = Set(selectedIds)
        return dish.groups.flatMap { group in
            group.options.filter { chosen.contains($0.id) }
                .map { CartModifier(optionId: $0.id, groupName: group.name, optionName: $0.name, price: $0.price) }
        }
    }

    /// Precio de una unidad: el del plato más el de cada opción elegida. Exacto (SW-8).
    var unitPrice: Decimal { selectedModifiers.reduce(dish.basePrice) { $0 + $1.price } }

    var total: Decimal { unitPrice * Decimal(quantity) }

    var cta: DishCTA {
        // Un total válido siempre cabe en `maxAmount`; el respaldo existe para no mostrar un hueco, no se espera.
        isValid ? .add(total: formatAmount(total) ?? formatSoles(total)) : .complete(missing: missing)
    }

    func isSelected(_ option: DishOption) -> Bool { selectedIds.contains(option.id) }

    func progress(of group: DishGroup) -> GroupProgress {
        GroupProgress(
            required: group.isRequired,
            done: group.isRequired && !missingGroupIds.contains(group.id.lowercased()),
            single: group.isSingle,
            count: count(in: group),
            max: group.isSingle ? 1 : group.maxSelections
        )
    }

    private func count(in group: DishGroup) -> Int {
        group.options.filter { selectedIds.contains($0.id) }.count
    }

    /// Las no elegidas se deshabilitan si el grupo de varias opciones llegó a su tope, o si tocarlas sumaría una
    /// opción por encima de `maxModifiers`. En un grupo `single` con una elegida, tocar otra la sustituye y el total
    /// de opciones no sube.
    func isDisabled(_ option: DishOption, in group: DishGroup) -> Bool {
        if isSelected(option) { return false }
        let replaces = group.isSingle && count(in: group) > 0
        return isFull(group) || (!replaces && selectedIds.count >= CartLimits.maxModifiers)
    }

    private func isFull(_ group: DishGroup) -> Bool {
        guard !group.isSingle, let max = group.maxSelections else { return false }
        return count(in: group) >= max
    }

    /// Tocar una opción. En `single` (radio) reemplaza a la elegida y, si el grupo no es obligatorio, tocar la elegida
    /// la quita; en los demás (casillas) alterna, salvo que el grupo esté en su tope.
    func toggling(_ option: DishOption, in group: DishGroup) -> DishSelection {
        let inGroup = Set(group.options.map(\.id))
        let others = selectedIds.filter { !inGroup.contains($0) }
        let current = selectedIds.filter { inGroup.contains($0) }
        let chosen = current.contains(option.id)
        let next: [String]
        if chosen && (!group.isSingle || !group.isRequired) {
            next = current.filter { $0 != option.id }
        } else if chosen || isDisabled(option, in: group) {
            next = current
        } else if group.isSingle {
            next = [option.id]
        } else {
            next = current + [option.id]
        }
        var copy = self
        copy.selectedIds = others + next
        return copy
    }

    func optionPrice(of option: DishOption, in group: DishGroup) -> OptionPrice {
        if group.priceDisplay == "total" {
            return .total(formatAmount(dish.basePrice + option.price) ?? option.priceText)
        }
        return option.price == 0 ? .included : .delta(option.priceText)
    }

    /// La nota se corta en `maxNoteLength`: el campo no deja escribir más.
    func withNote(_ raw: String) -> DishSelection {
        var copy = self
        copy.note = takeUTF16(raw, CartLimits.maxNoteLength)
        return copy
    }

    func withQuantity(_ value: Int) -> DishSelection {
        var copy = self
        copy.quantity = min(max(value, 1), CartLimits.maxQuantity)
        return copy
    }

    /// La línea de la bolsa. `nil` si la selección no es válida.
    func toLine() -> CartLine? {
        guard isValid else { return nil }
        return CartLine(
            itemId: dish.id, name: dish.name, basePrice: dish.basePrice, modifiers: selectedModifiers,
            note: normalizeNote(note), quantity: quantity, imageURL: dish.imageURL
        )
    }
}
