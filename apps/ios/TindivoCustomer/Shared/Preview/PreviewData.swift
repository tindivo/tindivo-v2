#if DEBUG
import Foundation
import TindivoAPI

/// Datos y dobles para los `#Preview` de las pantallas. Solo existen en compilaciones de desarrollo.
enum PreviewData {
    static let price = Decimal(string: "12.50") ?? 0

    static let summaries: [BusinessSummary] = [
        BusinessSummary(
            id: "n1", slug: "don-lucho", name: "Pollería Don Lucho", accentColor: "F97316",
            tagline: "Pollo a la brasa", estimatedEtaMin: 25, estimatedEtaMax: 40, isOpenNow: true
        ),
        BusinessSummary(
            id: "n2", slug: "lung-fung", name: "Chifa Lung Fung", accentColor: "166534",
            estimatedEtaMin: 30, estimatedEtaMax: 45, isOpenNow: false
        ),
        BusinessSummary(
            id: "n3", slug: "rosita", name: "Juguería Rosita", accentColor: "991B1B",
            tagline: "Jugos y sándwiches", primaryCapability: .catalogOnly,
            estimatedEtaMin: 15, estimatedEtaMax: 25, isOpenNow: true
        ),
    ]

    static let menu = BusinessMenu(
        business: .init(
            id: "n1", name: "Pollería Don Lucho", tagline: "Pollo a la brasa", accentColor: "F97316",
            whatsappNumber: "+51987654321"
        ),
        categories: [
            .init(
                id: "c1", name: "Pollos", blurb: "Todos con papas", displayOrder: 1,
                items: [
                    .init(
                        id: "i1", name: "1/4 de pollo", description: "Con papas fritas y ensalada",
                        basePrice: Decimal(string: "12.50") ?? 0, displayOrder: 1,
                        modifierGroups: [
                            .init(
                                id: "g1", name: "Cremas", selectionType: "multi", isRequired: false,
                                minSelections: 0, maxSelections: 2, priceDisplay: "delta",
                                options: [
                                    .init(id: "o1", name: "Ají", additionalPrice: 0),
                                    .init(id: "o2", name: "Mayonesa", additionalPrice: Decimal(string: "1.00") ?? 0),
                                ]
                            ),
                            .init(
                                id: "g2", name: "Presa", selectionType: "single", isRequired: true,
                                minSelections: 1, maxSelections: 1, priceDisplay: "delta",
                                options: [
                                    .init(id: "o3", name: "Pecho", additionalPrice: 0),
                                    .init(id: "o4", name: "Pierna", additionalPrice: Decimal(string: "2.00") ?? 0),
                                ]
                            ),
                        ]
                    ),
                    .init(
                        id: "i2", name: "Gaseosa personal", basePrice: Decimal(string: "3.00") ?? 0,
                        isAvailable: false, displayOrder: 2
                    ),
                ]
            ),
            .init(
                id: "c2", name: "Bebidas", displayOrder: 2,
                items: [
                    .init(id: "i3", name: "Chicha morada", basePrice: Decimal(string: "5.00") ?? 0, displayOrder: 1),
                    // Con franja (hasta las 20:20): para probar que la ficha se cierra sola al salir de ella.
                    .init(
                        id: "i4", name: "Chicha de la noche", basePrice: Decimal(string: "4.00") ?? 0, displayOrder: 2,
                        availableFrom: "12:00", availableTo: "20:20"
                    ),
                ]
            ),
        ],
        featured: .init(title: "Destacados", itemIds: ["i1", "i3"])
    )
}

/// Un catálogo que responde siempre lo mismo: lo que un `#Preview` necesita para pintar la pantalla.
struct PreviewCatalog: CatalogRepository {
    var businesses: Result<[BusinessSummary], AppError> = .success(PreviewData.summaries)
    var business: Result<BusinessMenu, AppError> = .success(PreviewData.menu)

    func listBusinesses() async throws(AppError) -> [BusinessSummary] { try businesses.get() }
    func getBusiness(id: String) async throws(AppError) -> BusinessMenu { try business.get() }
}

extension FileCartStore {
    /// Una bolsa en un archivo temporal propio: un preview nunca toca la bolsa real.
    static func preview() -> FileCartStore {
        FileCartStore(fileURL: FileManager.default.temporaryDirectory.appending(path: "preview-\(UUID().uuidString)/cart.json"))
    }
}
#endif
