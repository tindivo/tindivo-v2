import Foundation
import Testing
@testable import TindivoCustomer

/// Los casos de `ModifierSelectionTest.kt` (a su vez los de `modifier-selection.test.ts` de `packages/contracts`).
@Suite("Validación de la elección de opciones")
struct ModifierSelectionTests {
    private let size = ModifierGroupRule(
        id: "size", name: "Tamaño", selectionType: "single", isRequired: true, minSelections: 0, maxSelections: nil
    )
    private let optionGroupOf = ["small": "size", "large": "size", "extra": "size", "sauce": "sauces"]

    private func rule(
        _ base: ModifierGroupRule, type: String? = nil, required: Bool? = nil, min: Int? = nil,
        max: Int?? = nil, id: String? = nil, name: String? = nil
    ) -> ModifierGroupRule {
        ModifierGroupRule(
            id: id ?? base.id, name: name ?? base.name, selectionType: type ?? base.selectionType,
            isRequired: required ?? base.isRequired, minSelections: min ?? base.minSelections,
            maxSelections: max ?? base.maxSelections
        )
    }

    private func check(_ ids: [String], _ group: ModifierGroupRule? = nil) -> [ModifierSelectionIssue] {
        checkModifierSelection(groups: [group ?? size], selectedOptionIds: ids, optionGroupOf: optionGroupOf)
    }

    @Test("single obligatorio exige una opción e ignora los límites de multi")
    func singleRequired() {
        #expect(check([]) == [.missing(groupId: "size", groupName: "Tamaño", single: true, min: 1)])
        #expect(check(["small"], rule(size, min: 3, max: .some(0))).isEmpty)
        #expect(check(["small", "large"]) == [.tooMany(groupId: "size", groupName: "Tamaño", single: true, max: 1)])
    }

    @Test("single opcional admite cero o una pero nunca dos")
    func singleOptional() {
        let optional = rule(size, required: false)
        #expect(check([], optional).isEmpty)
        #expect(check(["small"], optional).isEmpty)
        #expect(check(["small", "large"], optional).count == 1)
    }

    @Test("multi o un tipo futuro obligatorio exige al menos uno y respeta min")
    func multiRequired() {
        for type in ["multi", "future_type"] {
            let multi = rule(size, type: type)
            #expect(check([], multi) == [.missing(groupId: "size", groupName: "Tamaño", single: false, min: 1)])
            #expect(check(["small"], multi).isEmpty)
            #expect(check(["small"], rule(multi, min: 2))
                == [.missing(groupId: "size", groupName: "Tamaño", single: false, min: 2)])
            #expect(check(["small", "large"], rule(multi, min: 2)).isEmpty)
        }
    }

    @Test("multi admite n igual a max y rechaza max más uno")
    func multiMax() {
        for type in ["multi", "future_type"] {
            let multi = rule(size, type: type, max: .some(2))
            #expect(check(["small", "large"], multi).isEmpty)
            #expect(check(["small", "large", "extra"], multi)
                == [.tooMany(groupId: "size", groupName: "Tamaño", single: false, max: 2)])
            #expect(check(["small", "large", "extra"], rule(multi, max: .some(nil))).isEmpty)
        }
    }

    @Test("multi opcional ignora min pero aplica max incluso si es cero")
    func multiOptional() {
        let multi = rule(size, type: "multi", required: false, min: 3)
        #expect(check([], multi).isEmpty)
        #expect(check(["small"], multi).isEmpty)
        #expect(check([], rule(multi, max: .some(0))).isEmpty)
        #expect(check(["small"], rule(multi, max: .some(0)))
            == [.tooMany(groupId: "size", groupName: "Tamaño", single: false, max: 0)])
    }

    @Test("cuenta cada grupo por separado e incluye los obligatorios sin selección")
    func perGroup() {
        let groups = [size, rule(size, id: "sauces", name: "Salsas")]
        #expect(checkModifierSelection(groups: groups, selectedOptionIds: ["small"], optionGroupOf: optionGroupOf)
            == [.missing(groupId: "sauces", groupName: "Salsas", single: true, min: 1)])
        #expect(checkModifierSelection(groups: groups, selectedOptionIds: ["small", "sauce"], optionGroupOf: optionGroupOf).isEmpty)
    }

    @Test("informa primero las repetidas aunque el grupo admita varias")
    func duplicatesFirst() {
        #expect(check(["small", "small"], rule(size, type: "multi")).first
            == .duplicate(groupId: "size", groupName: "Tamaño", optionId: "small"))
        guard case .duplicate = check(["small", "small"]).first else {
            Issue.record("la repetida debía ir primero")
            return
        }
    }

    @Test("el mismo uuid en mayúsculas y minúsculas es una opción repetida")
    func caseInsensitiveDuplicate() {
        let option = "abcdefab-1234-4000-8000-abcdef123456"
        let issues = checkModifierSelection(
            groups: [size], selectedOptionIds: [option, option.uppercased()], optionGroupOf: [option: "size"]
        )
        #expect(issues.first == .duplicate(groupId: "size", groupName: "Tamaño", optionId: option))
    }

    @Test("compara claves del mapa e ids de grupo sin distinguir mayúsculas")
    func caseInsensitiveKeys() {
        let option = "abcdefab-1234-4000-8000-abcdef123456"
        let group = "fedcbafe-1234-4000-8000-fedcba654321"
        #expect(checkModifierSelection(groups: [size], selectedOptionIds: [option.uppercased()], optionGroupOf: [option: "size"]).isEmpty)
        #expect(checkModifierSelection(
            groups: [rule(size, id: group.uppercased())], selectedOptionIds: [option],
            optionGroupOf: [option.uppercased(): group]
        ).isEmpty)
        #expect(checkModifierSelection(
            groups: [rule(size, id: group)], selectedOptionIds: [option], optionGroupOf: [option: group.uppercased()]
        ).isEmpty)
    }

    @Test("un plato sin grupos admite vacío y detecta ids repetidos")
    func noGroups() {
        #expect(checkModifierSelection(groups: [], selectedOptionIds: [], optionGroupOf: [:]).isEmpty)
        #expect(checkModifierSelection(groups: [], selectedOptionIds: ["x", "x"], optionGroupOf: [:])
            == [.duplicate(groupId: nil, groupName: nil, optionId: "x")])
    }
}
