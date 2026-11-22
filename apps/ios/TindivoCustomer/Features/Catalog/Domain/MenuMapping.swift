import Foundation
import TindivoAPI

/// Un plato de la carta, ya decidido: la pantalla no conoce los modelos de red.
struct MenuItem: Sendable, Equatable {
    /// Lo que la ficha y la bolsa usan del plato (compartido con Bolsa).
    let dish: Dish
    let description: String?
    /// Texto listo para mostrar (`S/ 12.50`); nunca se usa para calcular.
    let priceText: String
    let isAvailable: Bool
    /// La foto grande para la cabecera del plato (la foto, y si no la miniatura). Lo que se ve en la fila es `imageURL`.
    let heroURL: String?
    /// Franja horaria: fuera de ella el plato se apaga y dice cuándo vuelve (ver `BusinessDetail.atInstant`).
    let window: DishWindow
    /// «Solo sáb y dom, de 11:00 a 15:00» mientras el plato esté fuera de su franja; `nil` si se sirve ahora.
    var outsideWindow: String?
    /// Etiquetas del plato (`badges` de la carta), tal como las escribió el restaurante.
    let badges: [String]
    /// «S/ 12.50» más barato posible cuando el plato pide elegir opciones obligatorias; `nil` si no las pide.
    let startingAtText: String?

    init(
        dish: Dish,
        description: String?,
        priceText: String,
        isAvailable: Bool,
        window: DishWindow,
        outsideWindow: String? = nil,
        heroURL: String? = nil,
        badges: [String] = [],
        startingAtText: String? = nil
    ) {
        self.badges = badges
        self.startingAtText = startingAtText
        self.dish = dish
        self.description = description
        self.priceText = priceText
        self.isAvailable = isAvailable
        self.heroURL = heroURL
        self.window = window
        self.outsideWindow = outsideWindow
    }

    var id: String { dish.id }
    var name: String { dish.name }
    var basePrice: Decimal { dish.basePrice }
    var imageURL: String? { dish.imageURL }

    /// Tiene foto (la grande o la miniatura): «Destacados» solo enseña platos con foto.
    var hasPhoto: Bool { imageURL != nil || heroURL != nil }

    /// Tiene opciones que elegir (obligatorias o no): se arma en la ficha, no con un «+» en la tarjeta.
    var isConfigurable: Bool { !dish.groups.isEmpty }

    /// Se puede pedir: no se acabó y es su turno.
    var orderable: Bool { isAvailable && outsideWindow == nil }
}

extension MenuItem: Identifiable {}

struct MenuCategory: Sendable, Equatable {
    let id: String
    let name: String
    let blurb: String?
    let items: [MenuItem]
}

struct BusinessDetail: Sendable, Equatable {
    /// El id del negocio: la bolsa lo guarda para saber de qué restaurante es.
    let id: String
    let name: String
    let tagline: String?
    let logoURL: String?
    let bannerURL: String?
    /// ARGB opaco; `nil` si el color del servidor no se pudo leer.
    let accent: UInt32?
    let categories: [MenuCategory]
    /// La sección «Destacados» que armó el restaurante (CUS-CAT-028); sus platos también están en `categories`.
    let featured: MenuCategory?
    let schedule: [ScheduleDay]
    /// `false` = nadie confirmó que hoy atiende; `nil` = no se pudo consultar.
    let openingConfirmed: Bool?
    /// Modo catálogo (`catalog_only`): se pide por WhatsApp, no por la bolsa (CUS-CAT-015).
    let catalogOnly: Bool
    let whatsappNumber: String?
    var capability: PrimaryCapability?
    var etaMin: Int?
    var etaMax: Int?

    /// Los platos de la carta, sin contar dos veces los de «Destacados».
    var dishCount: Int { categories.reduce(0) { $0 + $1.items.count } }

    /// Lo que se pinta, de arriba abajo: «Destacados» primero y luego las secciones de la carta.
    var sections: [MenuCategory] { (featured.map { [$0] } ?? []) + categories }

    /// Marca los platos fuera de su franja en el instante `now` con su texto de vuelta («Solo sáb y dom, de 11:00 a
    /// 15:00»): se siguen viendo, apagados (decisión de Jesús, 2026-11-19, que sustituye a D-59). Los agotados no se
    /// tocan. Se aplica a la carta ya validada.
    func atInstant(_ now: Date) -> BusinessDetail {
        func mark(_ category: MenuCategory) -> MenuCategory {
            MenuCategory(
                id: category.id, name: category.name, blurb: category.blurb,
                items: category.items.map { item in
                    var marked = item
                    marked.outsideWindow = item.window.isOpen(at: now) ? nil : item.window.describe()
                    return marked
                }
            )
        }
        return BusinessDetail(
            id: id, name: name, tagline: tagline, logoURL: logoURL, bannerURL: bannerURL, accent: accent,
            categories: categories.map(mark), featured: featured.map(mark), schedule: schedule,
            openingConfirmed: openingConfirmed, catalogOnly: catalogOnly, whatsappNumber: whatsappNumber,
            capability: capability, etaMin: etaMin, etaMax: etaMax
        )
    }
}

enum MenuMapping {
    /// Por qué una carta se descarta entera (para el error que verá quien depure).
    static let invalidMenuDetail = "carta inválida: un precio fuera de numeric(10,2) o una opción repetida"

    /// Tope de platos de «Destacados» (`FEATURED_MAX_ITEMS` de `packages/contracts`).
    private static let featuredMax = 6
    /// El id de la sección «Destacados»: sus platos ya están en su sección de la carta y no se cuentan dos veces.
    static let featuredID = "featured"

    /// `nil` si algún plato o alguna opción trae un precio que no se puede mostrar tal cual (ver `menuPriceOrNil`),
    /// o si un plato repite un grupo o una opción: la carta falla entera.
    static func detail(from menu: BusinessMenu) -> BusinessDetail? {
        var categories: [MenuCategory] = []
        for raw in stableSorted(menu.categories, by: \.displayOrder) {
            guard let category = category(raw) else { return nil }
            if !category.items.isEmpty { categories.append(category) }
        }
        let byID = Dictionary(
            categories.flatMap(\.items).map { ($0.id, $0) },
            uniquingKeysWith: { _, last in last }
        )
        // «Destacados» solo con platos que se pueden pedir y se ven bien: disponibles y con foto (CUS-CAT-028).
        let featuredItems = (menu.featured?.itemIds ?? []).compactMap { byID[$0] }
            .filter { $0.isAvailable && $0.hasPhoto }
            .prefix(featuredMax)
        let business = menu.business
        return BusinessDetail(
            id: business.id,
            name: business.name,
            tagline: nonBlank(business.tagline),
            logoURL: nonBlank(business.logoURL),
            bannerURL: nonBlank(business.bannerURL),
            accent: parseAccent(business.accentColor),
            categories: categories,
            // Un plato destacado que ya no está en la carta, está agotado o no tiene foto se descarta; sin platos no hay
            // sección.
            featured: featuredItems.isEmpty
                ? nil
                : MenuCategory(
                    id: featuredID,
                    name: nonBlank(menu.featured?.title) ?? String(localized: "Destacados"),
                    blurb: nil,
                    items: Array(featuredItems)
                ),
            schedule: menu.schedule,
            openingConfirmed: menu.openingConfirmed,
            catalogOnly: business.primaryCapability == .catalogOnly,
            whatsappNumber: nonBlank(business.whatsappNumber),
            capability: business.primaryCapability,
            etaMin: business.estimatedEtaMin,
            etaMax: business.estimatedEtaMax
        )
    }

    private static func category(_ raw: BusinessMenu.Category) -> MenuCategory? {
        var items: [MenuItem] = []
        for rawItem in stableSorted(raw.items, by: \.displayOrder) {
            guard let item = item(rawItem) else { return nil }
            items.append(item)
        }
        return MenuCategory(id: raw.id, name: raw.name, blurb: nonBlank(raw.blurb), items: items)
    }

    private static func item(_ raw: BusinessMenu.Item) -> MenuItem? {
        // El precio de carta del plato y el de cada opción pasan por la misma validación (ver `menuPriceOrNil`).
        guard let base = menuPriceOrNil(raw.basePrice) else { return nil }
        var groups: [DishGroup] = []
        for group in raw.modifierGroups {
            var options: [DishOption] = []
            for option in group.options {
                guard let price = menuPriceOrNil(option.additionalPrice) else { return nil }
                options.append(DishOption(
                    id: option.id, name: option.name, description: nonBlank(option.description),
                    price: price, priceText: formatSoles(price)
                ))
            }
            groups.append(DishGroup(
                id: group.id, name: group.name, selectionType: group.selectionType, isRequired: group.isRequired,
                minSelections: group.minSelections, maxSelections: group.maxSelections,
                priceDisplay: group.priceDisplay, options: options
            ))
        }
        if hasRepeatedIDs(groups) { return nil }
        return MenuItem(
            dish: Dish(
                id: raw.id, name: raw.name, basePrice: base,
                // D-55: la miniatura si existe; si no, la foto grande.
                imageURL: nonBlank(raw.thumbnailURL) ?? nonBlank(raw.imageURL),
                groups: groups
            ),
            description: nonBlank(raw.description),
            priceText: formatSoles(base),
            isAvailable: raw.isAvailable,
            window: DishWindow(days: raw.availableDays, from: raw.availableFrom, to: raw.availableTo),
            // Cabecera del plato: la foto grande primero; la fila de la carta usa la miniatura (`Dish.imageURL`).
            heroURL: nonBlank(raw.imageURL) ?? nonBlank(raw.thumbnailURL),
            badges: raw.badges.compactMap(nonBlank),
            startingAtText: startingAt(base: base, groups: groups)
        )
    }

    /// «Desde S/ x»: el precio más bajo con que se puede pedir el plato, que es el base más lo más barato de cada grupo
    /// obligatorio (tantas opciones como pida su mínimo). `nil` si ningún grupo es obligatorio. Solo para mostrar.
    private static func startingAt(base: Decimal, groups: [DishGroup]) -> String? {
        let required = groups.filter(\.isRequired)
        guard !required.isEmpty else { return nil }
        let extras = required.reduce(Decimal.zero) { total, group in
            let cheapest = group.options.map(\.price).sorted().prefix(max(1, group.minSelections))
            return total + cheapest.reduce(Decimal.zero, +)
        }
        return formatAmount(base + extras)
    }

    /// Un plato que repite un grupo o una opción (sin distinguir mayúsculas) no es una carta que se pueda enseñar: la
    /// ficha sumaría dos veces el precio de esa opción y el pedido la rechazaría (`checkModifierSelection`, 0275). No
    /// se deduplica.
    private static func hasRepeatedIDs(_ groups: [DishGroup]) -> Bool {
        let groupIDs = groups.map { $0.id.lowercased() }
        let optionIDs = groups.flatMap { $0.options.map { $0.id.lowercased() } }
        return Set(groupIDs).count != groupIDs.count || Set(optionIDs).count != optionIDs.count
    }
}

/// El texto sin espacios en los bordes, o `nil` si queda vacío.
func nonBlank(_ text: String?) -> String? {
    guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    return text
}

/// Ordena por una clave sin perder el orden original a igual clave (`sorted` no garantiza estabilidad).
func stableSorted<T>(_ values: [T], by key: (T) -> Int) -> [T] {
    values.enumerated()
        .sorted { (key($0.element), $0.offset) < (key($1.element), $1.offset) }
        .map(\.element)
}
