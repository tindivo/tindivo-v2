import SwiftUI
import TindivoDesign

/// La fila de un plato (`MenuItemRow.kt`), en su tarjeta blanca con sombra y 16 de margen. El nombre y la descripción
/// entran ya como `AttributedString` para que los resultados de búsqueda reusen la misma fila con lo que casó resaltado;
/// en la carta salen sin anotaciones. `categoryName` solo se pasa en los resultados, donde el plato aparece fuera de su
/// sección. Sin control: tocar la fila abre la ficha (`onTap`, CUS-CAT-029). Un plato agotado o fuera de su franja se
/// sigue viendo, atenuado, y no responde al toque.
struct MenuItemRowView: View {
    let item: MenuItem
    var name: AttributedString
    var description: AttributedString?
    var categoryName: String?
    var onTap: (() -> Void)?
    @Environment(\.dynamicTypeSize) private var typeSize

    static let thumbnailSize: CGFloat = 104
    private static let thumbnailRadius: CGFloat = 12

    init(
        item: MenuItem,
        name: AttributedString? = nil,
        description: AttributedString? = nil,
        categoryName: String? = nil,
        onTap: (() -> Void)?
    ) {
        self.item = item
        self.name = name ?? AttributedString(item.name)
        self.description = description ?? item.description.map { AttributedString($0) }
        self.categoryName = categoryName
        self.onTap = onTap
    }

    private var tappable: Bool { item.orderable && onTap != nil }

    var body: some View {
        Group {
            if tappable, let onTap {
                Button(action: onTap) { card }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("menu.dish")
            } else {
                card.accessibilityElement(children: .combine)
            }
        }
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
    }

    private var card: some View {
        TindivoCard(padding: 12) {
            // Con letra de accesibilidad la foto sube y el texto usa todo el ancho: al lado de la foto no cabe.
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 12) {
                    thumbnail
                    texts
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(alignment: .top, spacing: 12) {
                    texts
                    thumbnail
                }
            }
        }
        .contentShape(Rectangle())
    }

    private var thumbnail: some View {
        TindivoThumbnail(url: item.imageURL, size: Self.thumbnailSize, radius: Self.thumbnailRadius)
            .opacity(item.orderable ? 1 : Self.dimmedOpacity)
    }

    private var texts: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let categoryName {
                Text(categoryName)
                    .tindivoText(TypeToken.labelSmall)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                    .lineLimit(1)
            }
            Text(name)
                .tindivoText(TypeToken.titleCard)
                .foregroundStyle(Color.tindivo.ink)
                .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                .multilineTextAlignment(.leading)
            if let description {
                Text(description)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                    .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                    .multilineTextAlignment(.leading)
            }
            Text(item.unbrokenPriceLabel)
                .accessibilityLabel(item.priceLabel)
                .tindivoText(TypeToken.labelLarge)
                .monospacedDigit()
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(Color.tindivo.ink)
                .padding(.top, 4)
                // Atenuar solo precio y foto: el texto de estado se queda legible, en el color secundario.
                .opacity(item.orderable ? 1 : Self.dimmedOpacity)
            if let status {
                Text(status)
                    .tindivoText(TypeToken.labelMedium)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                    .multilineTextAlignment(.leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    static let dimmedOpacity = 0.5

    /// «Agotado» (lo marca la cajera) y «no es su turno» son cosas distintas: la franja dice cuándo vuelve.
    private var status: String? {
        if item.isAvailable, let window = item.outsideWindow { return window }
        return item.isAvailable ? nil : String(localized: "No disponible")
    }
}

extension MenuItem {
    /// «Desde S/ 12.50» cuando el plato pide elegir opciones obligatorias; si no, su precio.
    var priceLabel: String {
        startingAtText.map { String(localized: "Desde \($0)") } ?? priceText
    }

    /// `priceLabel` para pintar: «S/» y el monto con un espacio que no se parte, para que con letra grande no quede
    /// «S/» en una línea y «12.50» en otra. Solo se ve; VoiceOver y las pruebas leen `priceLabel`.
    var unbrokenPriceLabel: String {
        priceLabel.replacingOccurrences(of: "S/ ", with: "S/\u{00A0}")
    }
}

#if DEBUG
#Preview("Filas de plato") {
    let base = MenuItem(
        dish: Dish(id: "1", name: "1/4 de pollo", basePrice: PreviewData.price, imageURL: nil, groups: []),
        description: "Con papas fritas y ensalada de la casa, y una crema a elección",
        priceText: "S/ 12.50", isAvailable: true, window: DishWindow(days: nil, from: nil, to: nil)
    )
    var off = base
    off.outsideWindow = "Solo sáb y dom, de 11:00 a 15:00"
    return VStack(spacing: TindivoTokens.Spacing.spaceInner) {
        MenuItemRowView(item: base) {}
        MenuItemRowView(item: off) {}
        MenuItemRowView(
            item: MenuItem(
                dish: Dish(id: "2", name: "Gaseosa", basePrice: 3, imageURL: nil, groups: []),
                description: nil, priceText: "S/ 3.00", isAvailable: false,
                window: DishWindow(days: nil, from: nil, to: nil)
            )
        ) {}
    }
    .padding(.vertical, TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
#endif
