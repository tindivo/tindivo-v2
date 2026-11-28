import SwiftUI

/// El selector de cantidad « − n + »: dos botones de `touchTarget` y el número en cifras tabulares.
///
/// - `label` nombra de qué es la cantidad («Cantidad de Chicha morada»).
/// - `identifier` pone un identificador a cada botón (`<identifier>.decrease`, `<identifier>.increase`).
/// - `decreaseRemoves`: con una unidad el «−» quita la línea; se dibuja como tacho, en rojo (token `error`).
/// - `style`: `.round` son dos botones con contorno redondo; `.pill` es la píldora de Android (alto 48, borde de 1 en
///   `outline`, «−», el número y «+» de 48 dentro); `.filledPill` es la de la barra de la ficha del plato (alto 56, con
///   el «−» en un círculo gris `outlineVariant` y el «+» en uno `primaryContainer`, como `DishBottomBar.kt`).
/// - Con VoiceOver encendido es UN control ajustable (como un `Stepper` del sistema): deslizar arriba o abajo suma o
///   quita una unidad. Sin VoiceOver los botones son independientes (control por voz, por botones y pruebas).
public struct TindivoStepper: View {
    public enum Style: Sendable {
        case round
        case pill
        case filledPill
    }

    private let style: Style
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
        style: Style = .round,
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
        self.style = style
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
            controls.accessibilityRepresentation { adjustable }
        } else {
            controls
        }
    }

    /// ¿Puede el control ajustable de VoiceOver bajar la cantidad? No si bajar quitaría la línea: eso es la acción
    /// «Quitar», aparte.
    static func adjustableDecrementAllowed(canDecrease: Bool, decreaseRemoves: Bool) -> Bool {
        canDecrease && !decreaseRemoves
    }

    /// El valor que VoiceOver dice: «1 unidad», «3 unidades» (plural del catálogo de textos).
    static func spokenQuantity(_ quantity: Int) -> String {
        String(localized: "\(quantity) unidades", bundle: .module)
    }

    private var adjustable: some View {
        Stepper {
            Text(verbatim: label)
        } onIncrement: {
            if canIncrease { onIncrease() }
        } onDecrement: {
            // El decremento ajustable NO quita la línea: bajar de 1 es un acto distinto, con su propia acción.
            if Self.adjustableDecrementAllowed(canDecrease: canDecrease, decreaseRemoves: decreaseRemoves) {
                onDecrease()
            }
        }
        .accessibilityValue(Text(verbatim: Self.spokenQuantity(quantity)))
        // Una sola vista para cualquier cantidad: la acción «Quitar» aparece y desaparece sin cambiar la identidad.
        .accessibilityActions {
            if decreaseRemoves { Button(action: onDecrease) { Text(verbatim: decreaseLabel) } }
        }
    }

    private var controls: some View {
        let capsule = style != .round
        return HStack(spacing: capsule ? 0 : TindivoTokens.Spacing.spaceInner) {
            TindivoRoundButton(
                decreaseRemoves ? .trash : .minus, label: decreaseLabel, enabled: canDecrease,
                tint: decreaseRemoves ? Color.tindivo.error : nil, bordered: !capsule,
                fill: style == .filledPill ? Color.tindivo.outlineVariant : nil, action: onDecrease
            )
            .accessibilityIdentifier(identifier.map { "\($0).decrease" } ?? "")
            Text(verbatim: "\(quantity)")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .monospacedDigit()
                .lineLimit(1)
                .fixedSize()
                .foregroundStyle(Color.tindivo.ink)
                .frame(minWidth: 24)
            TindivoRoundButton(
                .plus, label: increaseLabel, enabled: canIncrease,
                tint: style == .filledPill ? Color.tindivo.primaryText : nil, bordered: !capsule,
                fill: style == .filledPill ? Color.tindivo.primaryContainer : nil, action: onIncrease
            )
            .accessibilityIdentifier(identifier.map { "\($0).increase" } ?? "")
        }
        // Android: los círculos de 48 van a 3 del borde de la píldora, que mide 56.
        .padding(.horizontal, style == .filledPill ? 3 : 0)
        .frame(minHeight: style == .filledPill ? TindivoTokens.Spacing.ctaHeight : nil)
        .overlay {
            if capsule { Capsule().stroke(Color.tindivo.outline, lineWidth: 1) }
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
    private let bordered: Bool
    private let fill: Color?
    private let action: () -> Void
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 16

    /// `tint` cambia el color del icono y del contorno (el tacho de quitar va en rojo). `bordered: false` quita el
    /// contorno: lo usa la píldora del selector de cantidad, que ya trae el suyo. `fill` pinta el círculo (también
    /// apagado: en cantidad 1 el «−» sigue legible, solo que no hace nada).
    public init(
        _ icon: TindivoIcon, label: String, enabled: Bool = true, tint: Color? = nil, bordered: Bool = true,
        fill: Color? = nil, action: @escaping () -> Void
    ) {
        self.icon = icon
        self.label = label
        self.enabled = enabled
        self.tint = tint
        self.bordered = bordered
        self.fill = fill
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(tindivo: icon)
                .accessibilityHidden(true)
                .font(.system(size: iconSize, weight: .bold))
                .foregroundStyle(enabled ? (tint ?? Color.tindivo.ink) : Color.tindivo.onDisabled)
                .frame(width: TindivoTokens.Spacing.touchTarget, height: TindivoTokens.Spacing.touchTarget)
                .background { if let fill { Circle().fill(fill) } }
                .overlay {
                    if bordered {
                        Circle().stroke(
                            enabled ? (tint ?? Color.tindivo.outline) : Color.tindivo.disabled, lineWidth: 1)
                    }
                }
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
            quantity: 1, label: "Cantidad de Chicha morada", canDecrease: true, canIncrease: true,
            decreaseRemoves: true,
            decreaseLabel: "Quitar Chicha morada", increaseLabel: "Una más", onDecrease: {}, onIncrease: {}
        )
        TindivoStepper(
            style: .pill, quantity: 2, label: "Cantidad de Chicha morada", canDecrease: true, canIncrease: true,
            decreaseLabel: "Una menos", increaseLabel: "Una más", onDecrease: {}, onIncrease: {}
        )
        TindivoStepper(
            style: .pill, quantity: 1, label: "Cantidad de Chicha morada", canDecrease: true, canIncrease: true,
            decreaseRemoves: true,
            decreaseLabel: "Quitar Chicha morada", increaseLabel: "Una más", onDecrease: {}, onIncrease: {}
        )
        TindivoStepper(
            style: .filledPill, quantity: 1, label: "Cantidad de Chicha morada", canDecrease: false, canIncrease: true,
            decreaseLabel: "Una menos", increaseLabel: "Una más", onDecrease: {}, onIncrease: {}
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
