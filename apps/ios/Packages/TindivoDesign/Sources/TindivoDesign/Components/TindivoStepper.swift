import SwiftUI

/// El selector de cantidad « − n + »: dos botones de `touchTarget` con etiquetas propias para VoiceOver (que dicen
/// qué se quita o agrega) y el número en cifras tabulares.
public struct TindivoStepper: View {
    private let quantity: Int
    private let canDecrease: Bool
    private let canIncrease: Bool
    private let decreaseLabel: String
    private let increaseLabel: String
    private let onDecrease: () -> Void
    private let onIncrease: () -> Void

    public init(
        quantity: Int,
        canDecrease: Bool,
        canIncrease: Bool,
        decreaseLabel: String,
        increaseLabel: String,
        onDecrease: @escaping () -> Void,
        onIncrease: @escaping () -> Void
    ) {
        self.quantity = quantity
        self.canDecrease = canDecrease
        self.canIncrease = canIncrease
        self.decreaseLabel = decreaseLabel
        self.increaseLabel = increaseLabel
        self.onDecrease = onDecrease
        self.onIncrease = onIncrease
    }

    public var body: some View {
        HStack(spacing: TindivoTokens.Spacing.spaceInner) {
            roundButton(.minus, label: decreaseLabel, enabled: canDecrease, action: onDecrease)
            Text(verbatim: "\(quantity)")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .monospacedDigit()
                .foregroundStyle(Color.tindivo.ink)
                .frame(minWidth: 24)
            roundButton(.plus, label: increaseLabel, enabled: canIncrease, action: onIncrease)
        }
    }

    private func roundButton(_ icon: TindivoIcon, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(tindivo: icon)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(enabled ? Color.tindivo.ink : Color.tindivo.onDisabled)
                .frame(width: TindivoTokens.Spacing.touchTarget, height: TindivoTokens.Spacing.touchTarget)
                .overlay(Circle().stroke(enabled ? Color.tindivo.outline : Color.tindivo.disabled, lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

#Preview("Selector de cantidad") {
    VStack(spacing: TindivoTokens.Spacing.spaceGroup) {
        TindivoStepper(
            quantity: 2, canDecrease: true, canIncrease: true,
            decreaseLabel: "Una menos", increaseLabel: "Una más", onDecrease: {}, onIncrease: {}
        )
        TindivoStepper(
            quantity: 1, canDecrease: false, canIncrease: true,
            decreaseLabel: "Una menos", increaseLabel: "Una más", onDecrease: {}, onIncrease: {}
        )
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
