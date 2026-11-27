import SwiftUI
import TindivoDesign

/// El aviso de «Deshacer». Cada quitada es otra vista (`.id(token)`): la raya y el foco de VoiceOver arrancan de nuevo.
struct UndoBar: View {
    let offer: CartScreenModel.UndoOffer
    let window: Duration
    /// Con VoiceOver el aviso no se cierra solo: no hay raya que se vacíe.
    let expires: Bool
    let onUndo: () -> Void

    @State private var start = Date()
    @AccessibilityFocusState private var focused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: TindivoTokens.Spacing.spaceInner) {
                    message.lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                    button
                }
                VStack(alignment: .leading, spacing: 0) {
                    message
                    button
                }
            }
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            .padding(.vertical, 4)
            if !reduceMotion, expires { bar }
        }
        .background(Color.tindivo.secondary, in: RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField))
        .clipShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField))
        .padding(TindivoTokens.Spacing.spaceScreen)
        .onAppear { focused = true }
    }

    private var message: some View {
        Text(offer.message)
            .tindivoText(TindivoTokens.Typography.body)
            .foregroundStyle(Color.tindivo.onSecondary)
            // Lo lee el botón («Quitaste X. Deshacer»): el texto suelto sonaría dos veces.
            .accessibilityHidden(true)
    }

    private var button: some View {
        Button(action: onUndo) {
            Text("Deshacer")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .foregroundStyle(Color.tindivo.onSecondary)
                .lineLimit(1)
                .fixedSize()
                .frame(minWidth: TindivoTokens.Spacing.touchTarget, minHeight: TindivoTokens.Spacing.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("\(offer.message). Deshacer"))
        .accessibilityFocused($focused)
        .accessibilityIdentifier("cart.undo")
    }

    /// La raya se vacía a lo largo del plazo; se calcula del instante en que apareció, no de un estado animado.
    private var bar: some View {
        let total = Double(window.components.seconds) + Double(window.components.attoseconds) / 1e18
        return TimelineView(.animation) { context in
            let left = max(0, 1 - context.date.timeIntervalSince(start) / max(total, 0.001))
            Rectangle()
                .fill(Color.tindivo.onSecondary.opacity(0.6))
                .frame(height: 3)
                .scaleEffect(x: left, anchor: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("cart.undo.progress")
        }
    }
}
