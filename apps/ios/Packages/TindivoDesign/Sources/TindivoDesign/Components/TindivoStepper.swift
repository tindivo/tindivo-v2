import SwiftUI

/// El selector de cantidad « − n + »: dos botones de `touchTarget` y el número en cifras tabulares. Para VoiceOver es UN
/// control ajustable («Cantidad, 2»): deslizar arriba o abajo suma o quita una unidad, que es como se maneja un
/// selector; las etiquetas de los botones («Una más») quedan para quien los toca de otras formas, como el control por
/// voz o el de botones.
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
            TindivoRoundButton(.minus, label: decreaseLabel, enabled: canDecrease, action: onDecrease)
            Text(verbatim: "\(quantity)")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .monospacedDigit()
                .lineLimit(1)
                .fixedSize()
                .foregroundStyle(Color.tindivo.ink)
                .frame(minWidth: 24)
            TindivoRoundButton(.plus, label: increaseLabel, enabled: canIncrease, action: onIncrease)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Cantidad", bundle: .module))
        .accessibilityValue(Text(verbatim: "\(quantity)"))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: if canIncrease { onIncrease() }
            case .decrement: if canDecrease { onDecrease() }
            @unknown default: break
            }
        }
    }
}

/// Un botón redondo de `touchTarget` con un icono («−», «+»), con su etiqueta para VoiceOver (CLI-13). Es el del
/// selector de cantidad y, solo, el «+» de agregar una unidad.
public struct TindivoRoundButton: View {
    private let icon: TindivoIcon
    private let label: String
    private let enabled: Bool
    private let action: () -> Void
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 16

    public init(_ icon: TindivoIcon, label: String, enabled: Bool = true, action: @escaping () -> Void) {
        self.icon = icon
        self.label = label
        self.enabled = enabled
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(tindivo: icon)
                .accessibilityHidden(true)
                .font(.system(size: iconSize, weight: .bold))
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
