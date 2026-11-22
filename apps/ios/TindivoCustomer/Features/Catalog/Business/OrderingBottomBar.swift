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
        case let .contact(number):
            if let number { ContactBarView(number: number) }
        }
    }
}

/// La barra fija «Ver mi bolsa» con las unidades y el subtotal de la carta de este negocio.
struct CartBarView: View {
    let summary: CartBarSummary
    let action: () -> Void

    var body: some View {
        TindivoBottomBar {
            // Con letra grande «Ver mi bolsa» y el resumen no caben en una línea: pasan a dos, uno sobre otro, y la
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
                Text("Ver mi bolsa")
                    .tindivoText(TindivoTokens.Typography.cta)
                    .lineLimit(1)
                    .fixedSize()
                if !vertical { Spacer(minLength: 0) }
                Text("\(unitsText(summary.count)) · \(summary.subtotal)")
                    .tindivoText(TindivoTokens.Typography.body)
                    .monospacedDigit()
                    .lineLimit(1)
                    .fixedSize()
            }
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            .padding(.vertical, vertical ? TindivoTokens.Spacing.spaceInner : 0)
            .frame(maxWidth: .infinity, minHeight: TindivoTokens.Spacing.ctaHeight)
        }
        .buttonStyle(TindivoCTAButtonStyle(cornerRadius: vertical ? TindivoTokens.Radius.radiusField : nil))
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

/// «Pedir por WhatsApp» y «Llamar», en lugar de la bolsa, para un negocio en modo catálogo.
struct ContactBarView: View {
    let number: String
    @Environment(\.openURL) private var openURL

    var body: some View {
        let whatsapp = whatsappURI(number).flatMap(URL.init(string:))
        let tel = telURI(number).flatMap(URL.init(string:))
        if whatsapp != nil || tel != nil {
            TindivoBottomBar {
                HStack(spacing: TindivoTokens.Spacing.spaceInner) {
                    if let whatsapp {
                        TindivoPrimaryButton("Pedir por WhatsApp") { openURL(whatsapp) }
                    }
                    if let tel {
                        TindivoSecondaryButton("Llamar") { openURL(tel) }
                            .fixedSize(horizontal: true, vertical: false)
                    }
                }
            }
        }
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
