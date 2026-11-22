import SwiftUI
import TindivoDesign

/// La sección «Destacados» (CUS-CAT-028): tarjetas con foto, nombre y precio en un carrusel que solo se mueve con el
/// dedo, sin avance automático. Un plato agotado o fuera de su franja se apaga y no se abre, como en la lista.
struct FeaturedCarouselView: View {
    let items: [MenuItem]
    let onTap: ((MenuItem) -> Void)?

    private static let cardWidth: CGFloat = 160
    private static let photoHeight: CGFloat = 120

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(alignment: .top, spacing: TindivoTokens.Spacing.spaceInner) {
                ForEach(items) { item in
                    card(item)
                }
            }
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        }
    }

    @ViewBuilder
    private func card(_ item: MenuItem) -> some View {
        if item.orderable, let onTap {
            Button { onTap(item) } label: { content(item) }
                .buttonStyle(.plain)
                .accessibilityIdentifier("menu.featured")
        } else {
            content(item).accessibilityElement(children: .combine)
        }
    }

    private func content(_ item: MenuItem) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            TindivoAsyncImage(url: item.imageURL)
                .frame(width: Self.cardWidth, height: Self.photoHeight)
                .clipShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusThumb))
            Text(item.name)
                .tindivoText(TindivoTokens.Typography.body)
                .fontWeight(.bold)
                .foregroundStyle(Color.tindivo.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            Text(item.priceText)
                .tindivoText(TindivoTokens.Typography.body)
                .fontWeight(.bold)
                .monospacedDigit()
                .foregroundStyle(Color.tindivo.ink)
            if let window = item.outsideWindow {
                Text(window)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                    .multilineTextAlignment(.leading)
            }
        }
        .frame(width: Self.cardWidth, alignment: .leading)
        .opacity(item.orderable ? 1 : 0.5)
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
        items: [item("1", "1/4 de pollo"), item("2", "Pollo entero con papas y ensalada"), item("3", "Ceviche", orderable: false)]
    ) { _ in }
    .padding(.vertical, TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
#endif
