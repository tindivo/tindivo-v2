import SwiftUI

/// El CTA de la pantalla, como el `TindivoPrimaryButton` de Android: relleno `primaryText` (`#C2410C`), 56 pt de alto y
/// texto `cta` en blanco, sin sombra; al pulsar, `onPrimaryContainer` (`#9A3412`, el `primaryPressed` de Android). Es el
/// mismo color de «Ver bolsa» y «Continuar» (decisión de Jesús, 2026-11-27). Blanco sobre `#C2410C` da 5,2:1. El
/// texto es `cta` (18 pt, negrita) y no se encoge: con letra grande pasa a dos líneas en un rectángulo redondeado.
///
/// Mientras `loading` es `true`, el botón deja de responder pero conserva su color, y VoiceOver sigue leyendo la
/// etiqueta y anuncia que está en curso: una segunda pulsación no repite la acción (paridad con Android).
public struct TindivoPrimaryButton: View {
    private let title: Text
    private let loading: Bool
    private let hint: LocalizedStringKey?
    private let action: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    public init(_ title: LocalizedStringKey, loading: Bool = false, action: @escaping () -> Void) {
        self.title = Text(title)
        self.loading = loading
        self.hint = nil
        self.action = action
    }

    /// Para un texto que ya viene armado y traducido («Agregar · S/ 12.50»): se enseña tal cual. `hint` es lo que
    /// VoiceOver dice del toque («Te lleva al grupo que falta»). El botón principal no se pinta apagado.
    public init(
        verbatim title: String, loading: Bool = false, hint: LocalizedStringKey? = nil,
        action: @escaping () -> Void
    ) {
        self.title = Text(verbatim: title)
        self.loading = loading
        self.hint = hint
        self.action = action
    }

    public var body: some View {
        // La guarda va dentro de la acción: `allowsHitTesting` frena el dedo pero no la activación de VoiceOver.
        Button(action: { if !loading { action() } }) {
            ZStack {
                title
                    .tindivoText(TindivoTokens.Typography.cta)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .opacity(loading ? 0 : 1)
                if loading {
                    ProgressView().tint(Color.tindivo.onPrimary)
                }
            }
            .frame(maxWidth: .infinity, minHeight: TindivoTokens.Spacing.ctaHeight)
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            .padding(.vertical, typeSize.isAccessibilitySize ? TindivoTokens.Spacing.spaceInner : 0)
        }
        .buttonStyle(
            TindivoCTAButtonStyle(
                cornerRadius: typeSize.isAccessibilitySize ? TindivoTokens.Radius.radiusField : nil
            )
        )
        .accessibilityHint(hint.map { Text($0) } ?? Text(verbatim: ""))
        .allowsHitTesting(!loading)
        .accessibilityValue(loading ? Text("En curso", bundle: .module) : Text(verbatim: ""))
    }
}

/// El aspecto del CTA, para quien necesita un botón principal con un contenido propio (la barra «Ver mi bolsa»).
public struct TindivoCTAButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    private let cornerRadius: CGFloat?

    /// `cornerRadius` en `nil` da la cápsula; con contenido de varias líneas (letra grande) se pasa un radio fijo,
    /// porque una cápsula alta se come el texto de los lados.
    public init(cornerRadius: CGFloat? = nil) {
        self.cornerRadius = cornerRadius
    }

    private var enabled: Bool { isEnabled }

    private var shape: AnyShape {
        cornerRadius.map { AnyShape(RoundedRectangle(cornerRadius: $0)) } ?? AnyShape(Capsule())
    }

    public func makeBody(configuration: Configuration) -> some View {
        let fill =
            enabled
            ? (configuration.isPressed ? Color.tindivo.onPrimaryContainer : Color.tindivo.primaryText)
            : Color.tindivo.disabled
        configuration.label
            .foregroundStyle(enabled ? Color.tindivo.onPrimary : Color.tindivo.onDisabled)
            .background(fill, in: shape)
            .contentShape(shape)
    }
}

#Preview("Botón principal") {
    VStack(spacing: TindivoTokens.Spacing.spaceGroup) {
        TindivoPrimaryButton("Confirmar pedido") {}
        TindivoPrimaryButton("Confirmar pedido", loading: true) {}
        TindivoPrimaryButton("Confirmar pedido") {}.disabled(true)
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
