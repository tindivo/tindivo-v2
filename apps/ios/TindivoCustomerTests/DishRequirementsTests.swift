import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

/// La ficha del plato (`catalogo/pantallas/plato.md`): qué dice el botón, el avance, los avisos y el resultado de
/// «Agregar». El ID del criterio va en el nombre de cada prueba.
@MainActor
@Suite("Plato: botón, avance y resultado")
struct DishRequirementsTests {
    /// «Pollo entero» con «Guarnición 1» y «Guarnición 2» obligatorias y un extra opcional (CUS-CAT-033).
    private var pollo: BusinessMenu.Item {
        func group(_ id: String, _ name: String, required: Bool, max: Int, _ options: [BusinessMenu.ModifierOption])
            -> BusinessMenu.ModifierGroup
        {
            BusinessMenu.ModifierGroup(
                id: id, name: name, selectionType: "single", isRequired: required, minSelections: required ? 1 : 0,
                maxSelections: max, priceDisplay: "delta", options: options
            )
        }
        func option(_ id: String, _ name: String, _ price: String = "0") -> BusinessMenu.ModifierOption {
            BusinessMenu.ModifierOption(id: id, name: name, additionalPrice: dec(price))
        }
        return BusinessMenu.Item(
            id: "pollo", name: "Pollo entero", basePrice: dec("46"), displayOrder: 1,
            modifierGroups: [
                group("g1", "Guarnición 1", required: true, max: 1, [option("papas", "Papas fritas")]),
                group(
                    "g2", "Guarnición 2", required: true, max: 1,
                    [option("ensalada", "Ensalada fresca"), option("arroz", "Arroz")]),
                group("g3", "Extra", required: false, max: 1, [option("crema", "Crema", "3")]),
            ]
        )
    }

    private func model(_ raw: BusinessMenu.Item? = nil, store: (any CartStore)? = nil) throws -> DishScreenModel {
        let detail = try #require(MenuMapping.detail(from: Fixture.menu([Fixture.category("c", [raw ?? pollo])])))
        let item = try #require(detail.categories.first?.items.first)
        return DishScreenModel(
            item: item, businessId: "negocio-1", businessName: "Don Lucho", cartStore: store ?? temporaryStore(),
            clock: .fixed(Fixture.tuesdayEvening)
        )
    }

    private func choose(_ id: String, in model: DishScreenModel) throws {
        for group in model.item.dish.groups {
            if let option = group.options.first(where: { $0.id == id }) { model.toggle(option, in: group) }
        }
    }

    @Test("CA-CAT-P7 con «Guarnición 2» sin elegir el botón dice «Elige tu guarnición 2» y no se apaga")
    func ctaNamesTheMissingGroup() throws {
        let model = try model()
        try choose("papas", in: model)
        #expect(model.ctaTitle == "Elige tu guarnición 2")
        #expect(model.ctaBlocked)
        #expect(!model.ctaDisabled, "el primario no se deshabilita: lleva al grupo que falta")
        #expect(model.firstMissingGroup?.id == "g2")
    }

    @Test("CUS-CAT-033 un grupo obligatorio de varias opciones dice «Elige [grupo]», sin «tu», en minúscula")
    func ctaForAMultipleGroupHasNoPossessive() throws {
        let raw = BusinessMenu.Item(
            id: "alitas", name: "Alitas", basePrice: dec("20"), displayOrder: 1,
            modifierGroups: [
                BusinessMenu.ModifierGroup(
                    id: "s", name: "  Salsas ", selectionType: "multiple", isRequired: true, minSelections: 2,
                    maxSelections: 3, priceDisplay: "delta",
                    options: ["a", "b", "c"].map { BusinessMenu.ModifierOption(id: $0, name: $0, additionalPrice: 0) })
            ]
        )
        let model = try model(raw)
        #expect(model.ctaTitle == "Elige salsas")
    }

    @Test("CA-CAT-P7 VoiceOver anuncia «Falta elegir: [grupo]» al llevar la vista al grupo")
    func announcesTheMissingGroup() async throws {
        let model = try model()
        #expect(model.attentionAnnouncement == nil)
        await model.tapAdd()
        #expect(model.attentionAnnouncement == "Falta elegir: Guarnición 1")
    }

    @Test("CUS-CAT-033 sin nada elegido el botón nombra el primer grupo obligatorio, no el opcional")
    func ctaNamesTheFirstRequired() throws {
        let model = try model()
        #expect(model.ctaTitle == "Elige tu guarnición 1")
    }

    @Test("CA-CAT-P7 tocar el botón con algo sin elegir no agrega: lleva al grupo que falta, y cada toque cuenta")
    func tapLeadsToTheMissingGroup() async throws {
        let store = temporaryStore()
        let model = try model(store: store)
        try choose("papas", in: model)
        await model.tapAdd()
        #expect(model.attention == DishScreenModel.Attention(groupID: "g2", serial: 1))
        await model.tapAdd()
        #expect(model.attention == DishScreenModel.Attention(groupID: "g2", serial: 2))
        #expect(await store.current() == nil, "no se agregó nada")
        #expect(model.outcome == nil)
    }

    @Test("CA-CAT-P8 el avance pasa de «1 de 2 listas» a «2 de 2 listas» y el botón a «Agregar · S/ 49.00»")
    func progressAndCta() throws {
        let model = try model()
        #expect(model.progressText == "0 de 2 listas")
        try choose("papas", in: model)
        #expect(model.progressText == "1 de 2 listas")
        try choose("ensalada", in: model)
        try choose("crema", in: model)
        #expect(model.progressText == "2 de 2 listas")
        #expect(model.ctaTitle.plain == "Agregar · S/ 49.00")
        #expect(!model.ctaBlocked)
        #expect(model.firstMissingGroup == nil)
    }

    @Test("CA-CAT-P8 con un solo grupo obligatorio el avance dice «lista» en singular; sin obligatorios no hay avance")
    func progressPlural() throws {
        let single = Fixture.item(
            "i1",
            groups: [Fixture.group("g", single: true, required: true, min: 1, max: 1, options: [Fixture.option("o")])])
        #expect(try model(single).progressText == "0 de 1 lista")
        #expect(try model(Fixture.item("i2")).progressText == nil)
    }

    @Test("CA-CAT-P7 una vez resuelto todo, tocar el botón agrega")
    func tapAddsWhenComplete() async throws {
        let store = temporaryStore()
        let model = try model(store: store)
        try choose("papas", in: model)
        try choose("arroz", in: model)
        await model.tapAdd()
        #expect(model.attention == nil)
        #expect(await store.current()?.lines.count == 1)
    }

    @Test("CUS-CAT-033 el estado de cada grupo dice «Obligatorio · elige 1», «Listo» u «Opcional»")
    func groupStatus() throws {
        let model = try model()
        let groups = model.item.dish.groups
        #expect(model.statusText(for: groups[0]) == "Obligatorio · elige 1")
        try choose("papas", in: model)
        #expect(model.statusText(for: groups[0]) == "Listo")
        #expect(model.statusText(for: groups[2]) == "Opcional")
    }

    @Test("M3 los contadores se leen en voz alta con palabras: «2 de 3 elegidas», «12 de 140 caracteres»")
    func spokenCounters() throws {
        let raw = Fixture.item(
            "i1",
            groups: [
                Fixture.group(
                    "g", min: 0, max: 3, options: [Fixture.option("a"), Fixture.option("b"), Fixture.option("c")]),
                Fixture.group("sin-tope", options: [Fixture.option("x")]),
            ])
        let model = try model(raw)
        let groups = model.item.dish.groups
        try choose("a", in: model)
        try choose("b", in: model)
        #expect(model.counter(for: groups[0])?.text == "2/3")
        #expect(model.counter(for: groups[0])?.spoken == "2 de 3 elegidas")
        #expect(model.counter(for: groups[1]) == nil, "un grupo sin tope no enseña «2/∞»")
        model.setNote("sin cebolla")
        #expect(model.noteCounter.text == "11/\(CartLimits.maxNoteLength)")
        #expect(model.noteCounter.spoken == "11 de \(CartLimits.maxNoteLength) caracteres")
    }

    // MARK: Resultado de «Agregar» (A10)

    @Test("A10 «Agregado» devuelve el cierre de la ficha una sola vez")
    func resolveAdded() async throws {
        let model = try model(Fixture.item("i1"))
        await model.add()
        #expect(model.resolveOutcome() == .added(capped: false))
        #expect(model.outcome == nil)
        #expect(model.resolveOutcome() == .stay)
    }

    @Test("A10 bolsa llena o error al guardar encienden el aviso en la ficha y no la cierran")
    func resolveNotices() async throws {
        let model = try model(Fixture.item("i1"))
        let store = temporaryStore()
        for index in 0..<CartLimits.maxLines {
            _ = try await store.add(businessId: "negocio-1", businessName: "Don Lucho", line: Fixture.line("x\(index)"))
        }
        let full = DishScreenModel(
            item: model.item, businessId: "negocio-1", businessName: "Don Lucho", cartStore: store,
            clock: .fixed(Fixture.tuesdayEvening)
        )
        await full.add()
        #expect(full.resolveOutcome() == .stay)
        #expect(full.notices.message == DishScreenModel.fullMessage)
        #expect(full.outcome == nil)
    }

    @Test("A10 la bolsa de otro restaurante deja la pregunta abierta hasta que la persona decida")
    func resolveOtherBusiness() async throws {
        let store = temporaryStore()
        _ = try await store.add(businessId: "otro", businessName: "Chifa", line: Fixture.line("x"))
        let model = try model(Fixture.item("i1"), store: store)
        await model.add()
        #expect(model.replacement == DishScreenModel.Replacement(current: "Chifa", new: "Don Lucho"))
        #expect(model.resolveOutcome() == .stay)
        #expect(model.replacement != nil, "no se consume: espera «Mantener» o «Vaciar y empezar»")
        model.keepCurrentBag()
        #expect(model.replacement == nil)
    }
}
