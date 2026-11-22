import Foundation

/// Las reglas de un grupo de opciones, como las sirve la carta (`modifier_groups`).
struct ModifierGroupRule: Sendable, Equatable {
    let id: String
    let name: String
    let selectionType: String
    let isRequired: Bool
    let minSelections: Int
    let maxSelections: Int?
}

enum ModifierSelectionIssue: Sendable, Equatable {
    case missing(groupId: String, groupName: String, single: Bool, min: Int)
    case tooMany(groupId: String, groupName: String, single: Bool, max: Int)
    case duplicate(groupId: String?, groupName: String?, optionId: String)
}

/// La misma regla que `checkModifierSelection` (`packages/contracts/src/modifier-selection.ts`) y que la base al crear
/// el pedido (0275): `single` vale como mínimo 1 y máximo 1 sin mirar `min`/`max`; cualquier otro tipo exige
/// `max(1, min)` si es obligatorio y respeta `max` aunque sea 0; una opción repetida se informa antes que los grupos.
/// La pertenencia y la disponibilidad de las opciones se comprueban en quien llama.
///
/// Postgres compara UUID sin distinguir mayúsculas; aquí se comparan en minúsculas por lo mismo.
func checkModifierSelection(
    groups: [ModifierGroupRule],
    selectedOptionIds: [String],
    optionGroupOf: [String: String]
) -> [ModifierSelectionIssue] {
    let groupOf = Dictionary(
        optionGroupOf.map { ($0.key.lowercased(), $0.value.lowercased()) },
        uniquingKeysWith: { _, last in last }
    )
    func groupName(_ id: String?) -> String? {
        groups.first { $0.id.lowercased() == id }?.name
    }

    var issues: [ModifierSelectionIssue] = []
    var seen = Set<String>()
    var duplicates = Set<String>()
    var counts: [String: Int] = [:]
    for optionId in selectedOptionIds.map({ $0.lowercased() }) {
        let groupId = groupOf[optionId]
        if seen.contains(optionId), duplicates.insert(optionId).inserted {
            issues.append(.duplicate(groupId: groupId, groupName: groupName(groupId), optionId: optionId))
        }
        seen.insert(optionId)
        if let groupId { counts[groupId, default: 0] += 1 }
    }
    for group in groups {
        let id = group.id.lowercased()
        let n = counts[id] ?? 0
        let single = group.selectionType == DishGroup.single
        let min = single ? 1 : max(1, group.minSelections)
        let maxAllowed = single ? 1 : group.maxSelections
        if let maxAllowed, n > maxAllowed {
            issues.append(.tooMany(groupId: id, groupName: group.name, single: single, max: maxAllowed))
        }
        if group.isRequired, n < min {
            issues.append(.missing(groupId: id, groupName: group.name, single: single, min: min))
        }
    }
    return issues
}
