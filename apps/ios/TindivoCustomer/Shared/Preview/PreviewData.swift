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
            primaryCapability: .catalogFull, whatsappNumber: "+51987654321", estimatedEtaMin: 25, estimatedEtaMax: 40
        ),
        categories: [
            .init(
                id: "c1", name: "Pollos", blurb: "Todos con papas", displayOrder: 1,
                items: [
                    .init(
                        id: "i1", name: "1/4 de pollo", description: "Con papas fritas y ensalada",
                        basePrice: Decimal(string: "12.50") ?? 0,
                        // `.invalid` nunca resuelve: la foto no carga y se ve el respaldo de marca, sin depender de la red.
                        imageURL: "https://fotos.invalid/i1.jpg", displayOrder: 1,
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
                    .init(
                        id: "i3", name: "Chicha morada", basePrice: Decimal(string: "5.00") ?? 0,
                        imageURL: "https://fotos.invalid/i3.jpg", displayOrder: 1
                    ),
                    // Con franja (hasta las 20:20): para probar que la ficha se cierra sola al salir de ella.
                    .init(
                        id: "i4", name: "Chicha de la noche", basePrice: Decimal(string: "4.00") ?? 0, displayOrder: 2,
                        availableFrom: "12:00", availableTo: "20:20"
                    ),
                ]
            ),
        ],
        featured: .init(title: "Destacados", itemIds: ["i1", "i3"]),
        // De lunes a sábado de 18:00 a 23:00 y el domingo cerrado: el reloj de las pruebas (martes 20:00) lo ve abierto.
        schedule: (0...6).map { day in
            .init(
                dayOfWeek: day, isOpen: day < 6,
                shift1Start: day < 6 ? "18:00" : nil, shift1End: day < 6 ? "23:00" : nil
            )
        }
    )
}

extension PreviewData {
    /// La carta del negocio cerrado de la lista (`n2`): abre de 12:00 a 15:00 todos los días menos el domingo. El
    /// martes a las 20:00 está cerrado y abre mañana a las 12:00: «Cerrado · abre mañana 12:00».
    static let closedMenu = BusinessMenu(
        business: .init(
            id: "n2", name: "Chifa Lung Fung", accentColor: "166534", primaryCapability: .catalogFull,
            estimatedEtaMin: 30, estimatedEtaMax: 45
        ),
        categories: [
            .init(
                id: "c1", name: "Platos", displayOrder: 1,
                items: [
                    .init(id: "i1", name: "Arroz chaufa", basePrice: Decimal(string: "15.00") ?? 0, displayOrder: 1)
                ]
            )
        ],
        schedule: (0...6).map { day in
            .init(
                dayOfWeek: day, isOpen: day < 6,
                shift1Start: day < 6 ? "12:00" : nil, shift1End: day < 6 ? "15:00" : nil
            )
        }
    )
}

/// Un catálogo que responde siempre lo mismo: lo que un `#Preview` necesita para pintar la pantalla.
struct PreviewCatalog: CatalogRepository {
    var businesses: Result<[BusinessSummary], AppError> = .success(PreviewData.summaries)
    var business: Result<BusinessMenu, AppError> = .success(PreviewData.menu)

    func listBusinesses() async throws(AppError) -> [BusinessSummary] { try businesses.get() }
    func getBusiness(id: String) async throws(AppError) -> BusinessMenu {
        // Cada negocio con su carta: `n2` es el cerrado de la lista.
        if id == "n2", case .success = business { return PreviewData.closedMenu }
        return try business.get()
    }
}

extension FileCartStore {
    /// Una bolsa en un archivo temporal propio: un preview nunca toca la bolsa real.
    static func preview() -> FileCartStore {
        FileCartStore(
            fileURL: FileManager.default.temporaryDirectory.appending(path: "preview-\(UUID().uuidString)/cart.json"))
    }
}
#endif
