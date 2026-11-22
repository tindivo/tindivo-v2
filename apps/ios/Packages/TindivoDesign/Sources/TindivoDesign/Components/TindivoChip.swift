import SwiftUI

/// Una etiqueta corta en píldora («Cerrado ahora», «Pedidos por WhatsApp»). El color no es la única señal: lleva texto.
public struct TindivoChip: View {
    public enum Tone: Sendable {
        case neutral
        case warning
    }

    private let text: String
    private let tone: Tone

    public init(_ text: String, tone: Tone = .neutral) {
        self.text = text
        self.tone = tone
    }

    public var body: some View {
        Text(text)
            .tindivoText(TindivoTokens.Typography.chip)
            .foregroundStyle(tone == .warning ? Color.tindivo.warning : Color.tindivo.inkSecondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 2)
            .background(
                tone == .warning ? Color.tindivo.warningContainer : Color.tindivo.surfaceSunken,
                in: Capsule()
            )
    }
}

#Preview("Chips") {
    HStack {
        TindivoChip("Cerrado ahora", tone: .warning)
        TindivoChip("Pedidos por WhatsApp")
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
}
