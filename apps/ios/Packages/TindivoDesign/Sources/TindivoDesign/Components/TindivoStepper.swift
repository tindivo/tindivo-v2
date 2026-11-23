import SwiftUI

/// El selector de cantidad « − n + »: dos botones de `touchTarget` y el número en cifras tabulares.
///
/// - `label` nombra de qué es la cantidad («Cantidad de Chicha morada»).
/// - `identifier` pone un identificador a cada botón (`<identifier>.decrease`, `<identifier>.increase`).
/// - `decreaseRemoves`: con una unidad el «−» quita la línea; se dibuja como tacho, en rojo (token `error`).
/// - Con VoiceOver encendido es UN control ajustable (como un `Stepper` del sistema): deslizar arriba o abajo suma o
///   quita una unidad. Sin VoiceOver los botones son independientes (control por voz, por botones y pruebas).
public struct TindivoStepper: View {
    private let quantity: Int
    private let label: String
    private let identifier: String?
    private let canDecrease: Bool
    private let canIncrease: Bool
    private let decreaseRemoves: Bool
    private let decreaseLabel: String
    private let increaseLabel: String
    private let onDecrease: () -> Void
    private let onIncrease: () -> Void
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver

    public init(
        quantity: Int,
        label: String,
        identifier: String? = nil,
        canDecrease: Bool,
        canIncrease: Bool,
        decreaseRemoves: Bool = false,
        decreaseLabel: String,
        increaseLabel: String,
        onDecrease: @escaping () -> Void,
        onIncrease: @escaping () -> Void
    ) {
        self.quantity = quantity
        self.label = label
        self.identifier = identifier
        self.canDecrease = canDecrease
        self.canIncrease = canIncrease
        self.decreaseRemoves = decreaseRemoves
        self.decreaseLabel = decreaseLabel
        self.increaseLabel = increaseLabel
        self.onDecrease = onDecrease
        self.onIncrease = onIncrease
    }

    public var body: some View {
        if voiceOver {
            controls.accessibilityRepresentation {
                Stepper {
                    Text(verbatim: label)
                } onIncrement: {
                    if canIncrease { onIncrease() }
                } onDecrement: {
                    if canDecrease { onDecrease() }
                }
                .accessibilityValue(Text(verbatim: "\(quantity)"))
            }
        } else {
            controls
        }
    }

    private var controls: some View {
        HStack(spacing: TindivoTokens.Spacing.spaceInner) {
            TindivoRoundButton(
                decreaseRemoves ? .trash : .minus, label: decreaseLabel, enabled: canDecrease,
                tint: decreaseRemoves ? Color.tindivo.error : nil, action: onDecrease
            )
            .accessibilityIdentifier(identifier.map { "\($0).decrease" } ?? "")
            Text(verbatim: "\(quantity)")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .monospacedDigit()
                .lineLimit(1)
                .fixedSize()
                .foregroundStyle(Color.tindivo.ink)
                .frame(minWidth: 24)
            TindivoRoundButton(.plus, label: increaseLabel, enabled: canIncrease, action: onIncrease)
                .accessibilityIdentifier(identifier.map { "\($0).increase" } ?? "")
        }
    }
}

/// Un botón redondo de `touchTarget` con un icono («−», «+»), con su etiqueta para VoiceOver (CLI-13). Es el del
/// selector de cantidad y, solo, el «+» de agregar una unidad.
public struct TindivoRoundButton: View {
    private let icon: TindivoIcon
    private let label: String
    private let enabled: Bool
    private let tint: Color?
    private let action: () -> Void
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 16

    /// `tint` cambia el color del icono y del contorno (el tacho de quitar va en rojo).
    public init(
        _ icon: TindivoIcon, label: String, enabled: Bool = true, tint: Color? = nil, action: @escaping () -> Void
    ) {
        self.icon = icon
        self.label = label
        self.enabled = enabled
        self.tint = tint
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(tindivo: icon)
                .accessibilityHidden(true)
                .font(.system(size: iconSize, weight: .bold))
                .foregroundStyle(enabled ? (tint ?? Color.tindivo.ink) : Color.tindivo.onDisabled)
                .frame(width: TindivoTokens.Spacing.touchTarget, height: TindivoTokens.Spacing.touchTarget)
                .overlay(Circle().stroke(enabled ? (tint ?? Color.tindivo.outline) : Color.tindivo.disabled, lineWidth: 1))
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
            quantity: 2, label: "Cantidad de Chicha morada", identifier: "demo", canDecrease: true, canIncrease: true,
            decreaseLabel: "Una menos", increaseLabel: "Una más", onDecrease: {}, onIncrease: {}
        )
        TindivoStepper(
            quantity: 1, label: "Cantidad de Chicha morada", canDecrease: true, canIncrease: true, decreaseRemoves: true,
            decreaseLabel: "Quitar Chicha morada", increaseLabel: "Una más", onDecrease: {}, onIncrease: {}
        )
        TindivoStepper(
            quantity: 1, label: "Cantidad de Chicha morada", canDecrease: false, canIncrease: true,
            decreaseLabel: "Una menos", increaseLabel: "Una más", onDecrease: {}, onIncrease: {}
        )
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}

#Preview("Botón redondo") {
    HStack {
        TindivoRoundButton(.plus, label: "Agregar") {}
        TindivoRoundButton(.trash, label: "Quitar", tint: Color.tindivo.error) {}
        TindivoRoundButton(.minus, label: "Una menos", enabled: false) {}
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
}
