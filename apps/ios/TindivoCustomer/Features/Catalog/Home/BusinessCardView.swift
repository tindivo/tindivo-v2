import SwiftUI
import TindivoDesign

/// La tarjeta de un negocio en Inicio (una línea para nombre y eslogan, como Android; con las tallas de accesibilidad
/// pasan a varias para no cortarse): logo (o su inicial sobre el color de acento), nombre, eslogan y su estado.
struct BusinessCardView: View {
    let business: BusinessCard
    let whatsapp: Bool
    /// «Cerrado · abre mañana 12:00» (CA-CAT-P2); solo se usa con el negocio cerrado.
    var closedLabel: String = OrderingMode.closedTitle
    let onTap: () -> Void

    private static let logoSize: CGFloat = 72
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Button(action: onTap) {
            // Cerrado: fondo `surfaceSunken` y el logo en grises; el estado lo dice además la píldora.
            TindivoCard(
                padding: 10, background: business.closed ? Color.tindivo.surfaceSunken : Color.tindivo.surface
            ) {
                HStack(spacing: TindivoTokens.Spacing.spaceInner) {
                    logo
                    VStack(alignment: .leading, spacing: 0) {
                        Text(business.name)
                            .tindivoText(TypeToken.titleCard)
                            .foregroundStyle(Color.tindivo.ink)
                            .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                        if let tagline = business.tagline {
                            Text(tagline)
                                .tindivoText(TindivoTokens.Typography.bodySecondary)
                                .foregroundStyle(Color.tindivo.inkSecondary)
                                .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                        }
                        status.padding(.top, 6)
                    }
                    .frame(maxWidth: .infinity, minHeight: Self.logoSize, alignment: .leading)
                    // Decorativo: la tarjeta entera ya es el botón que abre el negocio.
                    Image(tindivo: .forward)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.tindivo.inkSecondary)
                        .accessibilityHidden(true)
                }
                .frame(minHeight: 92 - 20)
            }
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
        // ViewThatFits: con letra grande la píldora y el plazo pasan a dos líneas en vez de cortarse.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { statusContent }
            VStack(alignment: .leading, spacing: 4) { statusContent }
        }
    }

    @ViewBuilder private var statusContent: some View {
        if business.closed {
            TindivoStatusPill(closedLabel, tone: .warning)
        } else if whatsapp {
            TindivoStatusPill(String(localized: "Pedidos por WhatsApp"))
        } else {
            TindivoStatusPill(String(localized: "Abierto"), tone: .success)
            // El tiempo estimado solo cuando se puede cumplir: un negocio cerrado no dice cuánto tarda.
            Text(String(localized: "\(business.etaMin)–\(business.etaMax) min"))
                .tindivoText(TypeToken.labelMedium)
                .foregroundStyle(Color.tindivo.inkSecondary)
        }
    }

    /// Decorativo a propósito: el nombre está al lado, y una etiqueta lo haría sonar dos veces. Sin logo, el respaldo de
    /// marca. Cerrado, el logo se ve en grises (la señal grande de «hoy no»).
    private var logo: some View {
        TindivoThumbnail(url: business.logoURL, size: Self.logoSize, radius: 16)
            .grayscale(business.closed ? 1 : 0)
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
