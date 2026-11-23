import SwiftUI

/// El CTA de la pantalla: relleno `primary`, 56 pt de alto, texto `cta` en blanco y sombra `elevation3` (canon §2–§5).
/// El texto es `cta` (18 pt, negrita): blanco sobre `#EE6417` da 3,25:1 y solo cuenta como texto grande si va en negrita
/// y a 14 pt o más (decisión de Jesús, 2026-11-22; HIG, tabla de contraste: negrita, 3:1). Por eso no se encoge: con
/// letra grande pasa a dos líneas en un rectángulo redondeado.
///
/// Mientras `loading` es `true`, el botón deja de responder pero conserva su color, y VoiceOver sigue leyendo la
/// etiqueta y anuncia que está en curso: una segunda pulsación no repite la acción (paridad con Android).
public struct TindivoPrimaryButton: View {
    private let title: Text
    private let loading: Bool
    private let muted: Bool
    private let hint: LocalizedStringKey?
    private let action: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    public init(_ title: LocalizedStringKey, loading: Bool = false, action: @escaping () -> Void) {
        self.title = Text(title)
        self.loading = loading
        self.muted = false
        self.hint = nil
        self.action = action
    }

    /// Para un texto que ya viene armado y traducido («Agregar · S/ 12.50»): se enseña tal cual. `muted` lo pinta como
    /// apagado pero lo deja tocable, para un botón que, apagado, aún tiene algo que hacer («Elige la guarnición 2»
    /// lleva al grupo que falta); `hint` es lo que VoiceOver dice de ese toque.
    public init(
        verbatim title: String, loading: Bool = false, muted: Bool = false, hint: LocalizedStringKey? = nil,
        action: @escaping () -> Void
    ) {
        self.title = Text(verbatim: title)
        self.loading = loading
        self.muted = muted
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
                cornerRadius: typeSize.isAccessibilitySize ? TindivoTokens.Radius.radiusField : nil, muted: muted
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
    private let muted: Bool

    /// `cornerRadius` en `nil` da la cápsula; con contenido de varias líneas (letra grande) se pasa un radio fijo,
    /// porque una cápsula alta se come el texto de los lados. `muted` pinta el botón como apagado sin desactivarlo.
    public init(cornerRadius: CGFloat? = nil, muted: Bool = false) {
        self.cornerRadius = cornerRadius
        self.muted = muted
    }

    private var enabled: Bool { isEnabled && !muted }

    private var shape: AnyShape {
        cornerRadius.map { AnyShape(RoundedRectangle(cornerRadius: $0)) } ?? AnyShape(Capsule())
    }

    public func makeBody(configuration: Configuration) -> some View {
        let fill =
            enabled
            ? (configuration.isPressed ? Color.tindivo.primaryPressed : Color.tindivo.primary)
            : Color.tindivo.disabled
        configuration.label
            .foregroundStyle(enabled ? Color.tindivo.onPrimary : Color.tindivo.onDisabled)
            .background(fill, in: shape)
            .tindivoElevation(enabled ? TindivoTokens.Elevation.elevation3 : [])
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
