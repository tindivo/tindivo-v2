import SwiftUI
import TindivoDesign

/// Los platos que casan con la consulta, con lo que casó resaltado. Busca siempre sobre la carta que ve la pantalla
/// (ya filtrada por franja), no sobre un estado aparte.
struct MenuSearchResultsView: View {
    let hits: [MenuHit]
    let query: String
    let businessName: String
    let onTap: ((MenuItem) -> Void)?
    var action: (MenuItem) -> DishRowAction? = { _ in nil }

    var body: some View {
        if hits.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("No encontramos “\(query.trimmingCharacters(in: .whitespacesAndNewlines))” en \(businessName)")
                    .tindivoText(TindivoTokens.Typography.titleSection)
                    .foregroundStyle(Color.tindivo.ink)
                Text(
                    "Prueba con otro nombre, o con un ingrediente: también buscamos dentro de la descripción de cada plato."
                )
                .tindivoText(TindivoTokens.Typography.body)
                .foregroundStyle(Color.tindivo.inkSecondary)
            }
            .padding(TindivoTokens.Spacing.spaceScreen)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .accessibilityIdentifier("search.empty")
        } else {
            ScrollView {
                LazyVStack(spacing: TindivoTokens.Spacing.spaceInner) {
                    ForEach(hits, id: \.item.id) { hit in
                        MenuItemRowView(
                            item: hit.item,
                            name: highlighted(hit.item.name, hit.nameRanges),
                            description: hit.item.description.map { highlighted($0, hit.descriptionRanges) },
                            categoryName: hit.categoryName,
                            action: action(hit.item),
                            onTap: onTap.map { tap in { tap(hit.item) } }
                        )
                    }
                }
                .padding(.vertical, TindivoTokens.Spacing.spaceInner)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private func highlighted(_ text: String, _ ranges: [MatchRange]) -> AttributedString {
        var attributed = AttributedString(text)
        for range in highlightRanges(in: text, ranges) {
            if let target = Range(range, in: attributed) {
                attributed[target].backgroundColor = Color.tindivo.primary.opacity(0.2)
            }
        }
        return attributed
    }
}
