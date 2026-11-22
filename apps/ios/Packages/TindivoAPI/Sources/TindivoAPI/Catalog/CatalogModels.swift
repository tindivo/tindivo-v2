import Foundation

/// `primary_capability` del negocio: un enum abierto (CLI-2). Un valor que esta versión no conoce llega como
/// `.unknown` con su texto, nunca rompe la decodificación.
public enum PrimaryCapability: Sendable, Equatable {
    case driversOnly
    case catalogPickup
    case catalogDelivery
    case catalogFull
    case pickupLocal
    /// Modo catálogo: se mira la carta y se pide por WhatsApp.
    case catalogOnly
    case unknown(String)

    public init(raw: String) {
        switch raw {
        case "drivers_only": self = .driversOnly
        case "catalog_pickup": self = .catalogPickup
        case "catalog_delivery": self = .catalogDelivery
        case "catalog_full": self = .catalogFull
        case "pickup_local": self = .pickupLocal
        case "catalog_only": self = .catalogOnly
        default: self = .unknown(raw)
        }
    }
}

/// Un negocio de la lista de Inicio (`GET /public/businesses`), con solo los campos que usa la app.
public struct BusinessSummary: Sendable, Equatable {
    public let id: String
    public let slug: String
    public let name: String
    /// Sin `#` en el servidor; se acepta con él.
    public let accentColor: String
    public let logoURL: String?
    public let tagline: String?
    public let primaryCapability: PrimaryCapability?
    public let estimatedEtaMin: Int
    public let estimatedEtaMax: Int
    /// `nil` = el servidor no lo sabe: no cierra la tarjeta.
    public let isOpenNow: Bool?

    public init(
        id: String,
        slug: String,
        name: String,
        accentColor: String,
        logoURL: String? = nil,
        tagline: String? = nil,
        primaryCapability: PrimaryCapability? = nil,
        estimatedEtaMin: Int,
        estimatedEtaMax: Int,
        isOpenNow: Bool? = nil
    ) {
        self.id = id
        self.slug = slug
        self.name = name
        self.accentColor = accentColor
        self.logoURL = logoURL
        self.tagline = tagline
        self.primaryCapability = primaryCapability
        self.estimatedEtaMin = estimatedEtaMin
        self.estimatedEtaMax = estimatedEtaMax
        self.isOpenNow = isOpenNow
    }
}

/// La carta de un negocio (`GET /public/businesses/{id}`). Los precios llegan exactos (`Decimal`, SW-8): `ExactMoney`
/// ya rechazó los de más de dos decimales. Lo que NO se valida aquí es el rango (negativos, más de ocho cifras
/// enteras): que un precio sea mostrable lo decide quien mapea la carta.
public struct BusinessMenu: Sendable, Equatable {
    public struct Business: Sendable, Equatable {
        public let id: String
        public let name: String
        public let tagline: String?
        public let logoURL: String?
        public let bannerURL: String?
        public let accentColor: String
        public let primaryCapability: PrimaryCapability?
        public let whatsappNumber: String?

        public init(
            id: String,
            name: String,
            tagline: String? = nil,
            logoURL: String? = nil,
            bannerURL: String? = nil,
            accentColor: String,
            primaryCapability: PrimaryCapability? = nil,
            whatsappNumber: String? = nil
        ) {
            self.id = id
            self.name = name
            self.tagline = tagline
            self.logoURL = logoURL
            self.bannerURL = bannerURL
            self.accentColor = accentColor
            self.primaryCapability = primaryCapability
            self.whatsappNumber = whatsappNumber
        }
    }

    public struct Category: Sendable, Equatable {
        public let id: String
        public let name: String
        public let blurb: String?
        public let displayOrder: Int
        public let items: [Item]

        public init(id: String, name: String, blurb: String? = nil, displayOrder: Int, items: [Item]) {
            self.id = id
            self.name = name
            self.blurb = blurb
            self.displayOrder = displayOrder
            self.items = items
        }
    }

    public struct Item: Sendable, Equatable {
        public let id: String
        public let name: String
        public let description: String?
        public let basePrice: Decimal
        public let imageURL: String?
        public let thumbnailURL: String?
        public let isAvailable: Bool
        public let displayOrder: Int
        /// Franja del plato: días 0 = lunes … 6 = domingo, y horas `HH:MM`.
        public let availableDays: [Int]?
        public let availableFrom: String?
        public let availableTo: String?
        public let modifierGroups: [ModifierGroup]

        public init(
            id: String,
            name: String,
            description: String? = nil,
            basePrice: Decimal,
            imageURL: String? = nil,
            thumbnailURL: String? = nil,
            isAvailable: Bool = true,
            displayOrder: Int,
            availableDays: [Int]? = nil,
            availableFrom: String? = nil,
            availableTo: String? = nil,
            modifierGroups: [ModifierGroup] = []
        ) {
            self.id = id
            self.name = name
            self.description = description
            self.basePrice = basePrice
            self.imageURL = imageURL
            self.thumbnailURL = thumbnailURL
            self.isAvailable = isAvailable
            self.displayOrder = displayOrder
            self.availableDays = availableDays
            self.availableFrom = availableFrom
            self.availableTo = availableTo
            self.modifierGroups = modifierGroups
        }
    }

    public struct ModifierGroup: Sendable, Equatable {
        public let id: String
        public let name: String
        /// `single` o `multi`; un tipo nuevo llega tal cual y se trata como `multi`.
        public let selectionType: String
        public let isRequired: Bool
        public let minSelections: Int
        public let maxSelections: Int?
        /// `delta` o `total`; un valor nuevo se trata como `delta`.
        public let priceDisplay: String
        public let options: [ModifierOption]

        public init(
            id: String,
            name: String,
            selectionType: String,
            isRequired: Bool,
            minSelections: Int,
            maxSelections: Int? = nil,
            priceDisplay: String,
            options: [ModifierOption]
        ) {
            self.id = id
            self.name = name
            self.selectionType = selectionType
            self.isRequired = isRequired
            self.minSelections = minSelections
            self.maxSelections = maxSelections
            self.priceDisplay = priceDisplay
            self.options = options
        }
    }

    public struct ModifierOption: Sendable, Equatable {
        public let id: String
        public let name: String
        public let description: String?
        public let additionalPrice: Decimal

        public init(id: String, name: String, description: String? = nil, additionalPrice: Decimal) {
            self.id = id
            self.name = name
            self.description = description
            self.additionalPrice = additionalPrice
        }
    }

    public struct Featured: Sendable, Equatable {
        public let title: String
        public let itemIds: [String]

        public init(title: String, itemIds: [String]) {
            self.title = title
            self.itemIds = itemIds
        }
    }

    /// Una fila de `business_schedule`: `dayOfWeek` 0 = lunes … 6 = domingo.
    public struct ScheduleDay: Sendable, Equatable {
        public let dayOfWeek: Int
        public let isOpen: Bool
        public let shift1Start: String?
        public let shift1End: String?
        public let shift2Start: String?
        public let shift2End: String?

        public init(
            dayOfWeek: Int,
            isOpen: Bool,
            shift1Start: String? = nil,
            shift1End: String? = nil,
            shift2Start: String? = nil,
            shift2End: String? = nil
        ) {
            self.dayOfWeek = dayOfWeek
            self.isOpen = isOpen
            self.shift1Start = shift1Start
            self.shift1End = shift1End
            self.shift2Start = shift2Start
            self.shift2End = shift2End
        }
    }

    public let business: Business
    public let categories: [Category]
    public let featured: Featured?
    public let schedule: [ScheduleDay]
    /// `false` = nadie confirmó que hoy atiende; `nil` = no se sabe.
    public let openingConfirmed: Bool?

    public init(
        business: Business,
        categories: [Category],
        featured: Featured? = nil,
        schedule: [ScheduleDay] = [],
        openingConfirmed: Bool? = nil
    ) {
        self.business = business
        self.categories = categories
        self.featured = featured
        self.schedule = schedule
        self.openingConfirmed = openingConfirmed
    }
}
