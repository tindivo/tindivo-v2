import SwiftUI
import TindivoDesign

/// La sección «Destacados» (`FeaturedCarousel.kt`, CUS-CAT-028): tarjetas blancas de 164 con foto, nombre y precio en un
/// carrusel que solo se mueve con el dedo, sin avance automático. El «+» (círculo de 32 en un toque de 48, abajo a la
/// derecha de la foto) abre la ficha igual que tocar la tarjeta: aquí no se agrega sin pasar por ella (CUS-CAT-029).
/// Un plato agotado o fuera de su franja se apaga y no se abre, como en la lista.
struct FeaturedCarouselView: View {
    let items: [MenuItem]
    let onTap: ((MenuItem) -> Void)?
    @Environment(\.dynamicTypeSize) private var typeSize

    private static let cardWidth: CGFloat = 164
    /// Con letra de accesibilidad, 164 parte las palabras: la tarjeta se ensancha y se sigue asomando la siguiente.
    private static let accessibilityCardWidth: CGFloat = 288
    private var width: CGFloat { typeSize.isAccessibilitySize ? Self.accessibilityCardWidth : Self.cardWidth }
    private static let photoHeight: CGFloat = 116

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(alignment: .top, spacing: TindivoTokens.Spacing.spaceInner) {
                ForEach(items) { item in
                    card(item)
                }
            }
            // Aire abajo para que la sombra de las tarjetas no se corte.
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            .padding(.bottom, 8)
        }
    }

    @ViewBuilder private func card(_ item: MenuItem) -> some View {
        if item.orderable, let onTap {
            ZStack(alignment: .topTrailing) {
                Button {
                    onTap(item)
                } label: {
                    content(item)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("menu.featured")
                Button {
                    onTap(item)
                } label: {
                    Image(tindivo: .plus)
                        .accessibilityHidden(true)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Color.tindivo.onPrimary)
                        .frame(width: 32, height: 32)
                        .background(Color.tindivo.primaryText, in: Circle())
                        .frame(
                            width: TindivoTokens.Spacing.touchTarget, height: TindivoTokens.Spacing.touchTarget
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Agregar \(item.name)"))
                .accessibilityIdentifier("menu.add")
                .padding(.top, Self.photoHeight - TindivoTokens.Spacing.touchTarget)
            }
            .frame(width: width)
        } else {
            content(item)
                .accessibilityElement(children: .combine)
        }
    }

    private func content(_ item: MenuItem) -> some View {
        TindivoCard {
            VStack(alignment: .leading, spacing: 0) {
                TindivoAsyncImage(url: item.imageURL)
                    .frame(width: width, height: Self.photoHeight)
                    .clipShape(
                        UnevenRoundedRectangle(
                            topLeadingRadius: TindivoTokens.Radius.radiusCard,
                            topTrailingRadius: TindivoTokens.Radius.radiusCard, style: .continuous)
                    )
                    .opacity(item.orderable ? 1 : MenuItemRowView.dimmedOpacity)
                VStack(alignment: .leading, spacing: 2) {
                    // Siempre dos líneas de alto: así todas las tarjetas del carrusel miden lo mismo.
                    Text(item.name)
                        .tindivoText(TypeToken.labelLarge)
                        .foregroundStyle(Color.tindivo.ink)
                        .lineLimit(typeSize.isAccessibilitySize ? 3 : 2, reservesSpace: true)
                        .multilineTextAlignment(.leading)
                    Text(item.unbrokenPriceLabel)
                        .accessibilityLabel(item.priceLabel)
                        .tindivoText(TypeToken.labelLarge)
                        .monospacedDigit()
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(Color.tindivo.ink)
                        .opacity(item.orderable ? 1 : MenuItemRowView.dimmedOpacity)
                    if let window = item.outsideWindow {
                        Text(window)
                            .tindivoText(TypeToken.labelSmall)
                            .foregroundStyle(Color.tindivo.inkSecondary)
                            .multilineTextAlignment(.leading)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 10)
                .padding(.bottom, 12)
            }
        }
        .frame(width: width)
        .contentShape(Rectangle())
    }
}

#if DEBUG
#Preview("Destacados") {
    let window = DishWindow(days: nil, from: nil, to: nil)
    func item(_ id: String, _ name: String, orderable: Bool = true) -> MenuItem {
        var item = MenuItem(
            dish: Dish(id: id, name: name, basePrice: PreviewData.price, imageURL: nil, groups: []),
            description: nil, priceText: "S/ 12.50", isAvailable: true, window: window
        )
        if !orderable { item.outsideWindow = "Solo sáb y dom" }
        return item
    }
    return FeaturedCarouselView(
        items: [
            item("1", "1/4 de pollo"), item("2", "Pollo entero con papas y ensalada"),
            item("3", "Ceviche", orderable: false),
        ]
    ) { _ in }
    .padding(.vertical, TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
#endif
