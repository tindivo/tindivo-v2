import SwiftUI
import TindivoDesign

/// La fila de un plato. El nombre y la descripción entran ya como `AttributedString` para que los resultados de
/// búsqueda reusen la misma fila con lo que casó resaltado; en la carta salen sin anotaciones. `categoryName` solo se
/// pasa en los resultados, donde el plato aparece fuera de su sección. `onTap` abre la ficha; un plato agotado o fuera
/// de su franja se sigue viendo, atenuado, y no responde al toque.
struct MenuItemRowView: View {
    let item: MenuItem
    var name: AttributedString
    var description: AttributedString?
    var categoryName: String?
    var onTap: (() -> Void)?
    /// El contador de la tarjeta (CUS-CAT-029); `nil` si el plato no se puede pedir ahora.
    var action: DishRowAction?

    static let thumbnailSize: CGFloat = 92

    init(
        item: MenuItem,
        name: AttributedString? = nil,
        description: AttributedString? = nil,
        categoryName: String? = nil,
        action: DishRowAction? = nil,
        onTap: (() -> Void)?
    ) {
        self.action = action
        self.item = item
        self.name = name ?? AttributedString(item.name)
        self.description = description ?? item.description.map { AttributedString($0) }
        self.categoryName = categoryName
        self.onTap = onTap
    }

    private var tappable: Bool { item.orderable && onTap != nil }

    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            if tappable, let onTap {
                Button(action: onTap) { row }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("menu.dish")
            } else {
                row.accessibilityElement(children: .combine)
            }
            // Fuera de la foto y fuera del botón que abre la ficha: cada toque es de una sola cosa.
            if let action {
                DishRowControlView(action: action, itemName: item.name)
                    .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            }
        }
    }

    private var row: some View {
        HStack(alignment: .top, spacing: TindivoTokens.Spacing.spaceInner) {
            VStack(alignment: .leading, spacing: 2) {
                if let categoryName {
                    Text(categoryName)
                        .tindivoText(TindivoTokens.Typography.bodySecondary)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                        .lineLimit(1)
                }
                Text(name)
                    .tindivoText(TindivoTokens.Typography.titleSection)
                    .foregroundStyle(Color.tindivo.ink)
                if let description {
                    Text(description)
                        .tindivoText(TindivoTokens.Typography.bodySecondary)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                        .lineLimit(2)
                }
                Text(item.priceLabel)
                    .tindivoText(TindivoTokens.Typography.body)
                    .fontWeight(.bold)
                    .monospacedDigit()
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(Color.tindivo.ink)
                    // Atenuar solo precio y foto: el texto de estado se queda legible, en el color secundario.
                    .opacity(item.orderable ? 1 : Self.dimmedOpacity)
                if let status {
                    Text(status)
                        .tindivoText(TindivoTokens.Typography.bodySecondary)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            TindivoAsyncImage(url: item.imageURL)
                .frame(width: Self.thumbnailSize, height: Self.thumbnailSize)
                .clipShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusThumb))
                .opacity(item.orderable ? 1 : Self.dimmedOpacity)
        }
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        .contentShape(Rectangle())
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
                description: nil, priceText: "S/ 3.00", isAvailable: false, window: DishWindow(days: nil, from: nil, to: nil)
            )
        ) {}
    }
    .padding(.vertical, TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
#endif
