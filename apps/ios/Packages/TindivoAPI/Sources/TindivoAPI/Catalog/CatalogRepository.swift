public import Foundation
package import OpenAPIRuntime

/// El catálogo público: la lista de negocios y la carta de uno. Sin sesión.
public protocol CatalogRepository: Sendable {
    /// `GET /public/businesses`: los negocios publicados, en el orden del servidor.
    func listBusinesses() async throws(AppError) -> [BusinessSummary]
    /// `GET /public/businesses/{id}`: el negocio, su carta y su horario. `idOrSlug` acepta el uuid o el slug.
    func getBusiness(id idOrSlug: String) async throws(AppError) -> BusinessMenu
}

/// Los tipos generados (`Operations.*`) no salen de aquí: se traducen a modelos propios.
package struct LiveCatalogRepository: CatalogRepository {
    private let client: Client

    package init(client: Client) {
        self.client = client
    }

    package func listBusinesses() async throws(AppError) -> [BusinessSummary] {
        let data = try await apiCall { try await client.listBusinesses().ok.body.json.data }
        return data.map { business in
            BusinessSummary(
                id: business.id,
                slug: business.slug,
                name: business.name,
                accentColor: business.accentColor,
                logoURL: business.logoUrl,
                tagline: business.tagline,
                primaryCapability: business.primaryCapability.map(PrimaryCapability.init(raw:)),
                estimatedEtaMin: business.estimatedEtaMin,
                estimatedEtaMax: business.estimatedEtaMax,
                isOpenNow: business.isOpenNow
            )
        }
    }

    package func getBusiness(id idOrSlug: String) async throws(AppError) -> BusinessMenu {
        let data = try await apiCall {
            try await client.getBusiness(path: .init(id: idOrSlug)).ok.body.json.data
        }
        let business = data.business
        return BusinessMenu(
            business: .init(
                id: business.id,
                name: business.name,
                tagline: business.tagline,
                logoURL: business.logoUrl,
                bannerURL: business.bannerUrl,
                accentColor: business.accentColor,
                primaryCapability: business.primaryCapability.map(PrimaryCapability.init(raw:)),
                whatsappNumber: business.whatsappNumber,
                estimatedEtaMin: business.estimatedEtaMin,
                estimatedEtaMax: business.estimatedEtaMax
            ),
            categories: data.categories.map(Self.category),
            featured: data.featured.map { .init(title: $0.title, itemIds: $0.itemIds) },
            schedule: data.schedule.map {
                .init(
                    dayOfWeek: $0.dayOfWeek,
                    isOpen: $0.isOpen,
                    shift1Start: $0.shift1Start,
                    shift1End: $0.shift1End,
                    shift2Start: $0.shift2Start,
                    shift2End: $0.shift2End
                )
            },
            openingConfirmed: data.openingConfirmed
        )
    }

    private typealias Payload = Operations.GetBusiness.Output.Ok.Body.JsonPayload.DataPayload

    private static func category(_ category: Payload.CategoriesPayloadPayload) -> BusinessMenu.Category {
        BusinessMenu.Category(
            id: category.id,
            name: category.name,
            blurb: category.blurb,
            displayOrder: category.displayOrder,
            items: category.items.map { item in
                BusinessMenu.Item(
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    basePrice: item.basePrice.value,
                    imageURL: item.imageUrl,
                    thumbnailURL: item.thumbnailUrl,
                    isAvailable: item.isAvailable,
                    displayOrder: item.displayOrder,
                    availableDays: item.availableDays,
                    availableFrom: item.availableFrom,
                    availableTo: item.availableTo,
                    modifierGroups: item.modifierGroups.map { group in
                        BusinessMenu.ModifierGroup(
                            id: group.id,
                            name: group.name,
                            selectionType: group.selectionType,
                            isRequired: group.isRequired,
                            minSelections: group.minSelections,
                            maxSelections: group.maxSelections,
                            priceDisplay: group.priceDisplay,
                            options: group.options.map {
                                BusinessMenu.ModifierOption(
                                    id: $0.id,
                                    name: $0.name,
                                    description: $0.description,
                                    additionalPrice: $0.additionalPrice.value
                                )
                            }
                        )
                    },
                    badges: item.badges
                )
            }
        )
    }
}
