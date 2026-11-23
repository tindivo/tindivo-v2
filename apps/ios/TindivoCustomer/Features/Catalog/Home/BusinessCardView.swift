import SwiftUI
import TindivoDesign

/// La tarjeta de un negocio en Inicio: logo (o su inicial sobre el color de acento), nombre, eslogan y su estado.
struct BusinessCardView: View {
    let business: BusinessCard
    let whatsapp: Bool
    /// «Cerrado · abre mañana 12:00» (CA-CAT-P2); solo se usa con el negocio cerrado.
    var closedLabel: String = OrderingMode.closedTitle
    let onTap: () -> Void

    private static let logoSize: CGFloat = 72

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: TindivoTokens.Spacing.spaceInner) {
                logo
                VStack(alignment: .leading, spacing: 2) {
                    Text(business.name)
                        .tindivoText(TindivoTokens.Typography.titleSection)
                        .foregroundStyle(Color.tindivo.ink)
                        .lineLimit(2)
                    if let tagline = business.tagline {
                        Text(tagline)
                            .tindivoText(TindivoTokens.Typography.bodySecondary)
                            .foregroundStyle(Color.tindivo.inkSecondary)
                            .lineLimit(2)
                    }
                    status.padding(.top, 6)
                }
                .frame(maxWidth: .infinity, minHeight: Self.logoSize, alignment: .leading)
            }
            .padding(TindivoTokens.Spacing.spaceInner)
            .background(Color.tindivo.surface, in: RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusCard))
            .tindivoElevation(TindivoTokens.Elevation.elevation1)
            .contentShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusCard))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }

    /// Estable para las pruebas de interfaz: dice qué tarjeta es sin depender de lo que cuente el servidor.
    private var identifier: String {
        if whatsapp { return "home.business.contact" }
        return business.closed ? "home.business.closed" : "home.business.open"
    }

    @ViewBuilder private var status: some View {
        HStack(spacing: 8) {
            if business.closed {
                TindivoChip(closedLabel, tone: .warning)
            }
            if whatsapp {
                TindivoChip(String(localized: "Pedidos por WhatsApp"))
            } else if !business.closed {
                // El tiempo estimado solo cuando se puede cumplir: un negocio cerrado no dice cuánto tarda.
                Text(String(localized: "\(business.etaMin)–\(business.etaMax) min"))
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
        }
    }

    /// Decorativo a propósito: el nombre está al lado, y una etiqueta lo haría sonar dos veces. Sin logo, el respaldo de
    /// marca. Cerrado, el logo se ve en gris y atenuado; el texto de estado no se atenúa.
    private var logo: some View {
        TindivoAsyncImage(url: business.logoURL)
            .grayscale(business.closed ? 1 : 0)
            .frame(width: Self.logoSize, height: Self.logoSize)
            .clipShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusThumb))
            .opacity(business.closed ? MenuItemRowView.dimmedOpacity : 1)
    }
}

#Preview("Tarjetas de negocio") {
    let open = BusinessCard(
        id: "1", name: "Pollería Don Lucho", tagline: "Pollo a la brasa", logoURL: nil, accent: 0xFFF9_7316,
        closed: false, etaMin: 25, etaMax: 40
    )
    VStack(spacing: TindivoTokens.Spacing.spaceInner) {
        BusinessCardView(business: open, whatsapp: false) {}
        BusinessCardView(
            business: BusinessCard(
                id: "2", name: "Chifa Lung Fung", tagline: nil, logoURL: nil, accent: nil,
                closed: true, etaMin: 25, etaMax: 40
            ),
            whatsapp: false, closedLabel: "Cerrado · abre mañana 12:00"
        ) {}
        BusinessCardView(business: open, whatsapp: true) {}
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
