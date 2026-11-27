import SwiftUI
import TindivoDesign

/// Lo de abajo de la carta, según lo que el negocio permita ahora: la bolsa, el aviso de cerrado (`ClosedBar` de
/// Android) o los botones de contacto del modo catálogo.
struct OrderingBottomBar: View {
    let ordering: OrderingMode
    let cart: CartBarSummary?
    let onOpenCart: () -> Void

    var body: some View {
        switch ordering {
        case .open:
            if let cart { CartBarView(summary: cart, action: onOpenCart) }
        case .closed:
            ClosedBarView(detail: ordering.closedDetail)
        case .contact:
            if let links = ordering.contactLinks { ContactBarView(links: links) }
        }
    }
}

/// La barra «Ver bolsa» (`CartBar.kt`): una píldora de 56 sobre un degradado del fondo, con el subtotal y las unidades
/// en un círculo blanco. VoiceOver la lee entera: «Ver bolsa, 2 unidades · S/ 30.00».
struct CartBarView: View {
    let summary: CartBarSummary
    let action: () -> Void

    private var spoken: String {
        let text = "\(unitsText(summary.count)) · \(summary.subtotal)"
        return text.contains(invalidAmountText) ? spokenAmountText(text) : text
    }

    var body: some View {
        // Con letra grande «Ver bolsa» y el resumen no caben en una línea: pasan a dos, uno sobre otro, y la píldora
        // (que en varias líneas se comería el texto) pasa a rectángulo redondeado.
        Button(action: action) {
            ViewThatFits(in: .horizontal) {
                pill(vertical: false)
                pill(vertical: true)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Ver bolsa, \(spoken)"))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("business.cartBar")
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        .padding(.top, 24)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity)
        .background {
            LinearGradient(
                stops: [
                    .init(color: Color.tindivo.background.opacity(0), location: 0),
                    .init(color: Color.tindivo.background, location: 0.45),
                ], startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea(edges: .bottom)
        }
    }

    private func pill(vertical: Bool) -> some View {
        let label = Text("Ver bolsa").tindivoText(TindivoTokens.Typography.titleSection)
        let subtotal = Text(summary.subtotal).tindivoText(TindivoTokens.Typography.titleSection).monospacedDigit()
        // Blanco sobre `primaryText` (`#C2410C`, el `primary` de Android) da 5,2:1.
        return Group {
            if vertical {
                VStack(spacing: 4) {
                    label.multilineTextAlignment(.center)
                    HStack(spacing: 8) {
                        subtotal; count
                    }
                }
                .padding(.vertical, TindivoTokens.Spacing.spaceInner)
                .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            } else {
                HStack(spacing: TindivoTokens.Spacing.spaceInner) {
                    label.lineLimit(1).fixedSize().frame(maxWidth: .infinity, alignment: .leading)
                    subtotal.lineLimit(1).fixedSize()
                    count
                }
                .padding(.leading, 24)
                .padding(.trailing, 8)
            }
        }
        .foregroundStyle(Color.tindivo.onPrimary)
        .frame(maxWidth: .infinity, minHeight: TindivoTokens.Spacing.ctaHeight)
        .background {
            RoundedRectangle(
                cornerRadius: vertical ? TindivoTokens.Radius.radiusField : TindivoTokens.Radius.radiusPill,
                style: .continuous
            )
            .fill(Color.tindivo.primaryText)
            .shadow(color: Color.tindivo.ink.opacity(0.25), radius: 3, y: 3)
        }
        .contentShape(Rectangle())
    }

    /// Las unidades, en un círculo blanco de 40 como mínimo.
    private var count: some View {
        Text(verbatim: "\(summary.count)")
            .tindivoText(TindivoTokens.Typography.titleSection)
            .monospacedDigit()
            .foregroundStyle(Color.tindivo.primaryText)
            .padding(.horizontal, 10)
            .frame(minWidth: 40, minHeight: 40)
            .background(.white, in: Capsule())
    }
}

/// El aviso de un negocio cerrado: «Cerrado ahora» y cuándo abre, o por qué no atiende hoy.
struct ClosedBarView: View {
    let detail: String?

    var body: some View {
        TindivoBottomBar {
            VStack(alignment: .leading, spacing: 2) {
                Text(OrderingMode.closedTitle)
                    .tindivoText(TindivoTokens.Typography.titleSection)
                    .foregroundStyle(Color.tindivo.ink)
                if let detail {
                    Text(detail)
                        .tindivoText(TindivoTokens.Typography.body)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("business.closedBar")
        }
    }
}

/// «Pedir por WhatsApp» y «Llamar», en lugar de la bolsa, para un negocio en modo catálogo. Con letra grande los dos
/// botones pasan uno sobre otro en vez de apretarse en una fila.
struct ContactBarView: View {
    let links: ContactLinks
    @Environment(\.openURL) private var openURL
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        TindivoBottomBar {
            layout {
                if let whatsapp = links.whatsapp {
                    TindivoPrimaryButton("Pedir por WhatsApp") { openURL(whatsapp) }
                }
                if let tel = links.tel {
                    if typeSize.isAccessibilitySize {
                        TindivoSecondaryButton("Llamar") { openURL(tel) }
                    } else {
                        TindivoSecondaryButton("Llamar") { openURL(tel) }
                            .fixedSize(horizontal: true, vertical: false)
                    }
                }
            }
        }
    }

    private var layout: AnyLayout {
        typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: TindivoTokens.Spacing.spaceInner))
            : AnyLayout(HStackLayout(spacing: TindivoTokens.Spacing.spaceInner))
    }
}

#if DEBUG
#Preview("Barras de abajo") {
    VStack(spacing: 0) {
        OrderingBottomBar(ordering: .open, cart: CartBarSummary(count: 3, subtotal: "S/ 37.50"), onOpenCart: {})
        OrderingBottomBar(ordering: .contact(whatsappNumber: "+51987654321"), cart: nil, onOpenCart: {})
    }
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
#endif
