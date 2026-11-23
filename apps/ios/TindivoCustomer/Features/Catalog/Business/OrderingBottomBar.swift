import SwiftUI
import TindivoDesign

/// La barra de abajo de la carta, según lo que el negocio permita ahora: la bolsa, el aviso de cerrado o los botones
/// de contacto del modo catálogo.
struct OrderingBottomBar: View {
    let ordering: OrderingMode
    let cart: CartBarSummary?
    let onOpenCart: () -> Void

    var body: some View {
        switch ordering {
        case .open:
            if let cart { CartBarView(summary: cart, action: onOpenCart) }
        case let .closed(status, opensDay):
            ClosedBarView(detail: OrderingMode.closed(status, opensDay: opensDay).closedDetail)
        case .contact:
            if let links = ordering.contactLinks { ContactBarView(links: links) }
        }
    }
}

/// La barra fija «Ver bolsa» con las unidades y el subtotal de la carta de este negocio.
struct CartBarView: View {
    let summary: CartBarSummary
    let action: () -> Void

    var body: some View {
        TindivoBottomBar {
            // Con letra grande «Ver bolsa» y el resumen no caben en una línea: pasan a dos, uno sobre otro, y la
            // cápsula (que en varias líneas se comería el texto) pasa a rectángulo redondeado.
            ViewThatFits(in: .horizontal) {
                button(vertical: false)
                button(vertical: true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("business.cartBar")
        }
    }

    private func button(vertical: Bool) -> some View {
        Button(action: action) {
            layout(vertical: vertical) {
                // En línea el texto mide lo que mide (si no cabe, `ViewThatFits` pasa a la variante vertical); en vertical
                // se parte en las líneas que haga falta, centrado, y nunca se sale de la pantalla.
                fitted(Text("Ver bolsa").tindivoText(TindivoTokens.Typography.cta), vertical: vertical)
                if !vertical { Spacer(minLength: 0) }
                // Blanco sobre `primary` da 3,25:1: solo cuenta como texto grande en negrita y a 14 pt o más
                // (decisión de Jesús, 2026-11-22; HIG: negrita, 3:1).
                fitted(
                    Text("\(unitsText(summary.count)) · \(summary.subtotal)")
                        .tindivoText(TindivoTokens.Typography.body)
                        .fontWeight(.bold)
                        .monospacedDigit(),
                    vertical: vertical
                )
            }
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            .padding(.vertical, vertical ? TindivoTokens.Spacing.spaceInner : 0)
            .frame(maxWidth: .infinity, minHeight: TindivoTokens.Spacing.ctaHeight)
        }
        .buttonStyle(TindivoCTAButtonStyle(cornerRadius: vertical ? TindivoTokens.Radius.radiusField : nil))
    }

    @ViewBuilder
    private func fitted(_ text: some View, vertical: Bool) -> some View {
        if vertical {
            text.multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
        } else {
            text.lineLimit(1).fixedSize()
        }
    }

    private func layout(vertical: Bool, @ViewBuilder _ content: () -> some View) -> some View {
        let spacing = TindivoTokens.Spacing.spaceInner
        return Group {
            if vertical { VStack(spacing: 2, content: content) } else { HStack(spacing: spacing, content: content) }
        }
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
        OrderingBottomBar(
            ordering: .closed(ClosedStatus(opensAt: "18:00", daysAhead: 0), opensDay: "mar"), cart: nil, onOpenCart: {}
        )
        OrderingBottomBar(ordering: .contact(whatsappNumber: "+51987654321"), cart: nil, onOpenCart: {})
    }
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
#endif
