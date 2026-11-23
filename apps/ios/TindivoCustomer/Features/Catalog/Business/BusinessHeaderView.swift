import SwiftUI
import TindivoDesign

/// La cabecera del negocio: logo (o el isotipo sobre crema si no hay), nombre, eslogan, su estado y, debajo, la fila
/// «Información del negocio ›» que abre la hoja (CUS-CAT-027; no hay botón «i» sobre la foto).
struct BusinessHeaderView: View {
    let business: BusinessDetail
    /// «Abierto · cierra 23:00» o «Cerrado · abre hoy 18:00»; `nil` sin horario.
    let status: String?
    /// Cómo recibe el pedido, solo como información, sin selector (CUS-CAT-017).
    let modes: [DeliveryMode]
    let onShowInfo: () -> Void

    private static let logoSize: CGFloat = 56

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
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
                    if let status {
                        Text(status)
                            .tindivoText(TindivoTokens.Typography.bodySecondary)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.tindivo.ink)
                            .accessibilityIdentifier("business.status")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button(action: onShowInfo) {
                HStack {
                    Text("Información del negocio")
                        .tindivoText(TindivoTokens.Typography.body)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.tindivo.primaryText)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 8)
                    Image(tindivo: .forward)
                        .accessibilityHidden(true)
                        .foregroundStyle(Color.tindivo.primaryText)
                }
                .frame(minHeight: TindivoTokens.Spacing.touchTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("business.infoRow")
            if !modes.isEmpty {
                // Informativo: no es un botón ni un selector; el método se elige al pagar (CUS-CRT-007).
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(modes.enumerated()), id: \.offset) { _, mode in
                        Text(mode.summary)
                            .tindivoText(TindivoTokens.Typography.bodySecondary)
                            .foregroundStyle(Color.tindivo.inkSecondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("business.modes")
            }
        }
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
    }

    /// Decorativo a propósito: el nombre está al lado, y una etiqueta lo haría sonar dos veces. Sin logo, el respaldo
    /// de marca.
    private var logo: some View {
        TindivoAsyncImage(url: business.logoURL)
            .frame(width: Self.logoSize, height: Self.logoSize)
            .clipShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusThumb))
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
