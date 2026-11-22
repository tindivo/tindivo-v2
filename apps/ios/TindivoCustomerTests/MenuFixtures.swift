import Foundation
import TindivoAPI
@testable import TindivoCustomer

/// La carta cruda de la API tal como la mandaría el servidor, para armar pantallas de prueba.
enum Fixture {
    typealias Raw = BusinessMenu

    static func option(_ id: String, _ price: String = "0") -> Raw.ModifierOption {
        Raw.ModifierOption(id: id, name: "Opción \(id)", additionalPrice: dec(price))
    }

    static func group(
        _ id: String, single: Bool = false, required: Bool = false, min: Int = 0, max: Int? = nil,
        options: [Raw.ModifierOption]
    ) -> Raw.ModifierGroup {
        Raw.ModifierGroup(
            id: id, name: "Grupo \(id)", selectionType: single ? "single" : "multi", isRequired: required,
            minSelections: min, maxSelections: max, priceDisplay: "delta", options: options
        )
    }

    static func item(
        _ id: String, order: Int = 1, price: String = "12.50", available: Bool = true,
        days: [Int]? = nil, from: String? = nil, to: String? = nil,
        image: String? = nil, groups: [Raw.ModifierGroup] = [], description: String? = nil, name: String? = nil
    ) -> Raw.Item {
        Raw.Item(
            id: id, name: name ?? "Plato \(id)", description: description, basePrice: dec(price), imageURL: image,
            isAvailable: available, displayOrder: order, availableDays: days, availableFrom: from, availableTo: to,
            modifierGroups: groups
        )
    }

    static func category(_ id: String, order: Int = 1, name: String? = nil, _ items: [Raw.Item]) -> Raw.Category {
        Raw.Category(id: id, name: name ?? "Sección \(id)", displayOrder: order, items: items)
    }

    /// Lunes a domingo de 18:00 a 23:00: abierto de noche, como La Florencia.
    static let nightSchedule: [BusinessMenu.ScheduleDay] = (0...6).map {
        .init(dayOfWeek: $0, isOpen: true, shift1Start: "18:00", shift1End: "23:00")
    }

    static func menu(
        _ categories: [Raw.Category], id: String = "negocio-1", featured: Raw.Featured? = nil,
        schedule: [BusinessMenu.ScheduleDay] = [], openingConfirmed: Bool? = nil,
        capability: PrimaryCapability? = .catalogFull, whatsapp: String? = nil, banner: String? = nil
    ) -> BusinessMenu {
        BusinessMenu(
            business: .init(
                id: id, name: "Don Lucho", tagline: "Pollo a la brasa", bannerURL: banner, accentColor: "F97316",
                primaryCapability: capability, whatsappNumber: whatsapp
            ),
            categories: categories, featured: featured, schedule: schedule, openingConfirmed: openingConfirmed
        )
    }

    /// Martes 2026-07-07 a las 20:00 en Lima: dentro del horario nocturno.
    static let tuesdayEvening = at("2026-07-07", "20:00")

    static func line(
        _ itemId: String = "i1", businessQuantity: Int = 1, price: String = "12.50", note: String? = nil
    ) -> CartLine {
        CartLine(
            itemId: itemId, name: "Plato \(itemId)", basePrice: dec(price), modifiers: [], note: note,
            quantity: businessQuantity, imageURL: nil
        )
    }
}

/// Una raíz de composición con un negocio y una bolsa propia: lo que una pantalla de Negocio necesita.
@MainActor
func makeBusinessModel(
    _ menu: BusinessMenu,
    clock: AppClock,
    cartStore: any CartStore = FileCartStore(
        fileURL: FileManager.default.temporaryDirectory.appending(path: "tindivo-test-\(UUID().uuidString)/cart.json")
    ),
    gate: Gate? = nil
) -> BusinessScreenModel {
    BusinessScreenModel(
        id: "negocio-1", catalog: StubCatalog(menus: Script(just: menu), gate: gate), cartStore: cartStore, clock: clock
    )
}

extension AppClock {
    /// Un reloj parado en `date`; dormir vuelve enseguida.
    static func fixed(_ date: Date) -> AppClock {
        AppClock(now: { date }, sleep: { _ in })
    }

    /// Un reloj parado en `date`; dormir espera a que la prueba abra `gate`.
    static func fixed(_ date: Date, sleepsUntil gate: Gate) -> AppClock {
        AppClock(now: { date }, sleep: { _ in await gate.wait() })
    }
}
