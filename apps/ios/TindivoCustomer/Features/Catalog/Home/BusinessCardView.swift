import SwiftUI
import TindivoDesign

/// La tarjeta de un negocio en Inicio: logo (o su inicial sobre el color de acento), nombre, eslogan y su estado.
struct BusinessCardView: View {
    let business: BusinessCard
    let whatsapp: Bool
    let onTap: () -> Void

    private static let logoSize: CGFloat = 72
    private static let closedOpacity = 0.45

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
                TindivoChip(String(localized: "Cerrado ahora"), tone: .warning)
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

    /// Decorativo a propósito: el nombre está al lado, y una etiqueta lo haría sonar dos veces.
    private var logo: some View {
        Group {
            if let url = business.logoURL {
                TindivoAsyncImage(url: url)
                    .grayscale(business.closed ? 1 : 0)
            } else {
                Text(initial)
                    .tindivoText(TindivoTokens.Typography.titleScreen)
                    .foregroundStyle(Color.tindivo.onPrimary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(accent)
                    .accessibilityHidden(true)
            }
        }
        .frame(width: Self.logoSize, height: Self.logoSize)
        .clipShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusThumb))
        .opacity(business.closed ? Self.closedOpacity : 1)
    }

    private var accent: Color {
        business.accent.map { Color(argb: $0) } ?? Color.tindivo.primary
    }

    private var initial: String {
        business.name.trimmingCharacters(in: .whitespacesAndNewlines).first.map { String($0).uppercased() } ?? "T"
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
            whatsapp: false
        ) {}
        BusinessCardView(business: open, whatsapp: true) {}
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
