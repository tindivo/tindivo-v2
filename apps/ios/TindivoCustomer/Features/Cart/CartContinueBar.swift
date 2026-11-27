import SwiftUI
import TindivoDesign

/// La barra fija de abajo (`ContinueBar` de Android): una píldora con «Continuar →» y el subtotal en su cápsula, sobre
/// una barra blanca de esquinas superiores de 28. El monto es el mismo del subtotal (CUS-CRT-015). Cuando no avanza,
/// dice por qué (CUS-CRT-009): «Cargando…», «Reintentar» (CA-CRT-14) o «El restaurante está cerrado ahora» (CA-CRT-07);
/// con una línea con problema o un importe roto sigue diciendo «Continuar», apagado, y el motivo está en la línea.
struct CartContinueBar: View {
    let state: CartScreenModel.ContinueState
    let subtotal: String
    /// Hay un «Reintentar» en curso: el botón se queda (apagado) para que VoiceOver no pierda el foco.
    let retrying: Bool
    let onContinue: () -> Void
    let onRetry: () -> Void

    private var label: String {
        switch state {
        case .loading: String(localized: "Cargando…")
        case .retry: String(localized: "Reintentar")
        case .closed: String(localized: "El restaurante está cerrado ahora")
        case .catalogOnly: String(localized: "Este restaurante solo recibe pedidos por WhatsApp")
        case .blocked, .ready: String(localized: "Continuar")
        }
    }

    private var tappable: Bool {
        switch state {
        case .ready: true
        case .retry: !retrying
        case .loading, .closed, .catalogOnly, .blocked: false
        }
    }

    /// «Reintentar» es una acción: se ve activo (y se apaga mientras corre). Lo demás que no avanza va apagado.
    private var active: Bool { state == .ready || state == .retry }

    private var spoken: String { "\(label), \(spokenAmountText(subtotal))" }

    private func tap() {
        if state == .retry { onRetry() } else { onContinue() }
    }

    var body: some View {
        Button(action: tap) {
            ViewThatFits(in: .horizontal) {
                pill(vertical: false)
                pill(vertical: true)
            }
        }
        .buttonStyle(.plain)
        // Con AX5 la barra fija tapaba media bolsa: crece hasta accessibility2 y no más (sigue en letra grande).
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
        .disabled(!tappable)
        // La etiqueta va en el botón mismo: así conserva su rasgo de botón y, apagado, VoiceOver dice «atenuado».
        .accessibilityLabel(Text(verbatim: spoken))
        .accessibilityIdentifier(state == .retry ? "cart.retry" : "cart.continue")
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        .padding(.top, TindivoTokens.Spacing.spaceInner)
        .padding(.bottom, TindivoTokens.Spacing.spaceScreen)
        .frame(maxWidth: .infinity)
        .background {
            UnevenRoundedRectangle(
                topLeadingRadius: TindivoTokens.Radius.radiusSheet, topTrailingRadius: TindivoTokens.Radius.radiusSheet,
                style: .continuous
            )
            .fill(Color.tindivo.surface)
            .shadow(color: Color.tindivo.ink.opacity(0.16), radius: 8, x: 0, y: -2)
            .ignoresSafeArea(edges: .bottom)
        }
    }

    private func pill(vertical: Bool) -> some View {
        let foreground = active ? Color.tindivo.onPrimary : Color.tindivo.onDisabled
        let text = Text(label).tindivoText(TindivoTokens.Typography.titleSection)
        return Group {
            if vertical {
                VStack(spacing: 4) {
                    text.multilineTextAlignment(.center)
                    amount
                }
                .padding(.vertical, TindivoTokens.Spacing.spaceInner)
                .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            } else {
                HStack(spacing: 0) {
                    HStack(spacing: 8) {
                        text.lineLimit(1).fixedSize()
                        if state == .ready || state == .blocked {
                            Image(tindivo: .arrowForward)
                                .font(.system(size: 18, weight: .semibold))
                        }
                    }
                    Spacer(minLength: 8)
                    amount
                }
                .padding(.leading, 24)
                .padding(.trailing, 8)
            }
        }
        .foregroundStyle(foreground)
        .frame(maxWidth: .infinity, minHeight: TindivoTokens.Spacing.ctaHeight)
        .background {
            RoundedRectangle(
                cornerRadius: vertical ? TindivoTokens.Radius.radiusField : TindivoTokens.Radius.radiusPill,
                style: .continuous
            )
            .fill(active ? Color.tindivo.primaryText : Color.tindivo.disabled)
            .opacity(state == .retry && retrying ? 0.6 : 1)
        }
        .contentShape(Rectangle())
    }

    /// El subtotal en su cápsula oscura; nunca se parte ni se corta.
    private var amount: some View {
        Text(subtotal)
            .tindivoText(TindivoTokens.Typography.titleSection)
            .monospacedDigit()
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            .frame(minHeight: 40)
            .background(Color.tindivo.ink.opacity(active ? 0.28 : 0.10), in: Capsule())
    }
}

#if DEBUG
#Preview("Continuar") {
    VStack(spacing: 8) {
        CartContinueBar(state: .ready, subtotal: "S/ 53.50", retrying: false, onContinue: {}, onRetry: {})
        CartContinueBar(state: .retry, subtotal: "S/ 53.50", retrying: false, onContinue: {}, onRetry: {})
        CartContinueBar(state: .closed, subtotal: "S/ 53.50", retrying: false, onContinue: {}, onRetry: {})
        CartContinueBar(state: .loading, subtotal: "S/ 53.50", retrying: false, onContinue: {}, onRetry: {})
        CartContinueBar(state: .blocked, subtotal: "—", retrying: false, onContinue: {}, onRetry: {})
    }
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
#endif
