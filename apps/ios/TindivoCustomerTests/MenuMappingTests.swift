import Foundation
import TindivoAPI
import Testing
@testable import TindivoCustomer

/// `MenuMappingTest.kt`: el mapeo de la carta a los modelos de la pantalla, precios y grupos de opciones.
@Suite("Mapeo de la carta")
struct MenuMappingTests {
    private typealias Raw = BusinessMenu

    private func option(_ id: String, _ price: String, description: String? = "  ") -> Raw.ModifierOption {
        Raw.ModifierOption(id: id, name: "Opción \(id)", description: description, additionalPrice: dec(price))
    }

    private func group(_ id: String, _ options: [Raw.ModifierOption]) -> Raw.ModifierGroup {
        Raw.ModifierGroup(
            id: id, name: "Salsa", selectionType: "multi", isRequired: true, minSelections: 1, maxSelections: 2,
            priceDisplay: "delta", options: options
        )
    }

    private func item(
        _ id: String, order: Int = 1, price: String = "18", groups: [Raw.ModifierGroup] = [],
        description: String? = nil, imageURL: String? = nil, thumbnailURL: String? = nil,
        days: [Int]? = nil, from: String? = nil, to: String? = nil
    ) -> Raw.Item {
        Raw.Item(
            id: id, name: "Plato \(id)", description: description, basePrice: dec(price), imageURL: imageURL,
            thumbnailURL: thumbnailURL, displayOrder: order, availableDays: days, availableFrom: from,
            availableTo: to, modifierGroups: groups
        )
    }

    private func menu(
        _ categories: [Raw.Category], featured: Raw.Featured? = nil, capability: PrimaryCapability? = .catalogFull,
        whatsapp: String? = nil
    ) -> BusinessMenu {
        BusinessMenu(
            business: .init(
                id: "negocio-1", name: "Don Lucho", tagline: " ", accentColor: "F97316",
                primaryCapability: capability, whatsappNumber: whatsapp
            ),
            categories: categories, featured: featured, schedule: [], openingConfirmed: nil
        )
    }

    private func category(_ id: String, order: Int = 1, _ items: [Raw.Item]) -> Raw.Category {
        Raw.Category(id: id, name: "Cat \(id)", displayOrder: order, items: items)
    }

    private func detail(_ menu: BusinessMenu) throws -> BusinessDetail {
        try #require(MenuMapping.detail(from: menu))
    }

    @Test("el plato trae su precio como número y sus grupos con opciones")
    func itemAndGroups() throws {
        let raw = item("p1", groups: [group("g1", [option("o1", "2.5"), option("o2", "0")])])
        let business = try detail(menu([category("c1", [raw])]))
        let dish = try #require(business.categories.first?.items.first)

        #expect(business.id == "negocio-1")
        #expect(business.tagline == nil)
        #expect(business.accent == 0xFFF97316)
        #expect(dish.basePrice == dec("18.00"))
        #expect(dish.priceText.plain == "S/ 18.00")
        let mapped = try #require(dish.dish.groups.first)
        #expect(mapped.selectionType == "multi" && mapped.isRequired && mapped.minSelections == 1)
        #expect(mapped.maxSelections == 2 && mapped.priceDisplay == "delta")
        #expect(mapped.options.map(\.price) == [dec("2.50"), dec("0")])
        #expect(mapped.options[0].priceText.plain == "S/ 2.50")
        #expect(mapped.options[0].description == nil)
    }

    @Test("ordena categorías y platos por display_order y deja fuera las categorías vacías")
    func ordering() throws {
        let business = try detail(menu([
            category("c2", order: 2, [item("b", order: 2), item("a", order: 1)]),
            category("c0", order: 0, []),
            category("c1", order: 1, [item("z", order: 5)]),
        ]))
        #expect(business.categories.map(\.id) == ["c1", "c2"])
        #expect(business.categories[1].items.map(\.id) == ["a", "b"])
    }

    @Test("D-55: la miniatura si existe; si no, la foto grande; una en blanco no cuenta")
    func thumbnail() throws {
        let business = try detail(menu([category("c", [
            item("a", imageURL: "big", thumbnailURL: "small"),
            item("b", order: 2, imageURL: "big", thumbnailURL: " "),
            item("c", order: 3),
        ])]))
        #expect(business.categories[0].items.map(\.imageURL) == ["small", "big", nil])
    }

    @Test("la cabecera del plato usa la foto grande; sin ella, la miniatura; una en blanco no cuenta")
    func hero() throws {
        let business = try detail(menu([category("c", [
            item("a", imageURL: "big", thumbnailURL: "small"),
            item("b", order: 2, imageURL: " ", thumbnailURL: "small"),
            item("c", order: 3),
        ])]))
        #expect(business.categories[0].items.map(\.heroURL) == ["big", "small", nil])
    }

    @Test("CA-CAT-02 «Destacados» sale primero con el título del restaurante y sus platos de la carta")
    func featured() throws {
        let raw = menu(
            [category("c", [item("p1")])],
            featured: .init(title: "Los más pedidos", itemIds: ["p1"])
        )
        let business = try detail(raw)
        #expect(business.featured?.name == "Los más pedidos")
        #expect(business.featured?.items.map(\.id) == ["p1"])
        #expect(business.sections.map(\.name) == ["Los más pedidos", "Cat c"])
    }

    @Test("CA-CAT-02 sin sección destacada, o con un plato que ya no está en la carta, no hay sección")
    func featuredMissing() throws {
        #expect(try detail(menu([category("c", [item("p1")])])).featured == nil)
        let stale = menu([category("c", [item("p1")])], featured: .init(title: "X", itemIds: ["fantasma"]))
        #expect(try detail(stale).featured == nil)
        let partial = menu([category("c", [item("p1")])], featured: .init(title: "X", itemIds: ["fantasma", "p1"]))
        #expect(try detail(partial).featured?.items.map(\.id) == ["p1"])
    }

    @Test("CA-CAT-02 «Destacados» sin título usa Destacados y no pasa de seis platos")
    func featuredTitleAndCap() throws {
        let items = (1...8).map { item("p\($0)", order: $0) }
        let raw = menu(
            [category("c", items)],
            featured: .init(title: " ", itemIds: items.map(\.id))
        )
        let section = try #require(try detail(raw).featured)
        #expect(section.name == "Destacados")
        #expect(section.items.map(\.id) == ["p1", "p2", "p3", "p4", "p5", "p6"])
    }

    @Test("CA-CAT-04 el modo catálogo y su WhatsApp llegan al modelo")
    func catalogOnly() throws {
        let business = try detail(menu([category("c", [item("p")])], capability: .catalogOnly, whatsapp: "+51987654321"))
        #expect(business.catalogOnly)
        #expect(business.whatsappNumber == "+51987654321")
        #expect(try !detail(menu([category("c", [item("p")])], capability: .unknown("nuevo"))).catalogOnly)
    }

    @Test("un plato o una opción con tres decimales, negativa o enorme deja la carta entera en nil")
    func badPrices() {
        for bad in ["2.505", "-1", "100000000"] {
            let inOption = menu([category("c", [item("p", groups: [group("g", [option("o1", "1"), option("o2", bad)])])])])
            #expect(MenuMapping.detail(from: inOption) == nil, "opción \(bad)")
            #expect(MenuMapping.detail(from: menu([category("c", [item("p", price: bad)])])) == nil, "plato \(bad)")
        }
    }

    @Test("una opción o un grupo repetido en el plato deja la carta entera en nil, sin distinguir mayúsculas")
    func repeatedIds() {
        let same = option("aaaa", "2.50")
        let upper = option("AAAA", "1")
        let lower = option("aaaa", "1")
        #expect(MenuMapping.detail(from: menu([category("c", [item("p", groups: [group("g", [same, same])])])])) == nil)
        #expect(MenuMapping.detail(from: menu([category("c", [item("p", groups: [group("g", [lower, upper])])])])) == nil)
        let twoGroups = [group("g", [option("a", "1")]), group("G", [option("b", "1")])]
        #expect(MenuMapping.detail(from: menu([category("c", [item("p", groups: twoGroups)])])) == nil)
        // El contraejemplo de CAX-004: 1050 veces la misma opción al precio máximo nunca llega a la ficha.
        let many = (0..<1050).map { _ in option("x", "99999999.99") }
        #expect(MenuMapping.detail(from: menu([category("c", [item("p", groups: [group("g", many)])])])) == nil)
    }

    @Test("fuera de su franja el plato se apaga y dice cuándo vuelve; los demás no se tocan")
    func outsideWindow() throws {
        let business = try detail(menu([category("c", [
            item("almuerzo", days: [5, 6], from: "11:00", to: "15:00"),
            item("siempre", order: 2),
        ])]))
        let tuesday = business.atInstant(at("2026-07-07", "20:00"))
        #expect(tuesday.categories[0].items[0].outsideWindow == "Solo sáb y dom, de 11:00 a 15:00")
        #expect(!tuesday.categories[0].items[0].orderable)
        #expect(tuesday.categories[0].items[1].outsideWindow == nil)
        let saturday = business.atInstant(at("2026-07-11", "12:00"))
        #expect(saturday.categories[0].items[0].outsideWindow == nil)
        #expect(saturday.categories[0].items[0].orderable)
    }

    @Test("un plato agotado no es pedible aunque esté en su franja")
    func soldOut() throws {
        var raw = item("p")
        raw = Raw.Item(id: raw.id, name: raw.name, basePrice: raw.basePrice, isAvailable: false, displayOrder: 1)
        let business = try detail(menu([category("c", [raw])])).atInstant(at("2026-07-07", "20:00"))
        #expect(!business.categories[0].items[0].orderable)
    }
}
