import SwiftUI
import TindivoDesign

/// La cabecera del negocio: logo (o su inicial sobre el color de acento), nombre y eslogan.
struct BusinessHeaderView: View {
    let business: BusinessDetail

    private static let logoSize: CGFloat = 56

    var body: some View {
        HStack(spacing: TindivoTokens.Spacing.spaceInner) {
            logo
            VStack(alignment: .leading, spacing: 2) {
                Text(business.name)
                    .tindivoText(TindivoTokens.Typography.titleScreen)
                    .foregroundStyle(Color.tindivo.ink)
                    .accessibilityAddTraits(.isHeader)
                if let tagline = business.tagline {
                    Text(tagline)
                        .tindivoText(TindivoTokens.Typography.bodySecondary)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
    }

    /// Decorativo a propósito: el nombre está al lado, y una etiqueta lo haría sonar dos veces.
    private var logo: some View {
        Group {
            if let url = business.logoURL {
                TindivoAsyncImage(url: url)
            } else {
                Text(initial)
                    .tindivoText(TindivoTokens.Typography.titleScreen)
                    .foregroundStyle(Color.tindivo.onPrimary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(business.accent.map { Color(argb: $0) } ?? Color.tindivo.primary)
                    .accessibilityHidden(true)
            }
        }
        .frame(width: Self.logoSize, height: Self.logoSize)
        .clipShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusThumb))
    }

    private var initial: String {
        business.name.trimmingCharacters(in: .whitespacesAndNewlines).first.map { String($0).uppercased() } ?? "T"
    }
}

/// El título de una sección de la carta, con su descripción si la tiene.
struct CategoryHeaderView: View {
    let category: MenuCategory

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(category.name)
                .tindivoText(TindivoTokens.Typography.titleSection)
                .foregroundStyle(Color.tindivo.ink)
                .accessibilityAddTraits(.isHeader)
            if let blurb = category.blurb {
                Text(blurb)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        .padding(.top, TindivoTokens.Spacing.spaceInner)
    }
}
