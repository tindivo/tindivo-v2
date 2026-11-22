import SwiftUI

/// El CTA de la pantalla: relleno `primary`, 56 pt de alto, texto `cta` en blanco y sombra `elevation3` (canon §2–§5).
///
/// Mientras `loading` es `true`, el botón deja de responder pero conserva su color, y VoiceOver sigue leyendo la
/// etiqueta y anuncia que está en curso: una segunda pulsación no repite la acción (paridad con Android).
public struct TindivoPrimaryButton: View {
    private let title: Text
    private let loading: Bool
    private let action: () -> Void
    @Environment(\.isEnabled) private var isEnabled

    public init(_ title: LocalizedStringKey, loading: Bool = false, action: @escaping () -> Void) {
        self.title = Text(title)
        self.loading = loading
        self.action = action
    }

    /// Para un texto que ya viene armado y traducido («Agregar · S/ 12.50»): se enseña tal cual.
    public init(verbatim title: String, loading: Bool = false, action: @escaping () -> Void) {
        self.title = Text(verbatim: title)
        self.loading = loading
        self.action = action
    }

    public var body: some View {
        // La guarda va dentro de la acción: `allowsHitTesting` frena el dedo pero no la activación de VoiceOver.
        Button(action: { if !loading { action() } }) {
            ZStack {
                title
                    .tindivoText(TindivoTokens.Typography.cta)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .opacity(loading ? 0 : 1)
                if loading {
                    ProgressView().tint(Color.tindivo.onPrimary)
                }
            }
            .frame(maxWidth: .infinity, minHeight: TindivoTokens.Spacing.ctaHeight)
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        }
        .buttonStyle(TindivoCTAButtonStyle())
        .allowsHitTesting(!loading)
        .accessibilityValue(loading ? Text("En curso", bundle: .module) : Text(verbatim: ""))
    }
}

/// El aspecto del CTA, para quien necesita un botón principal con un contenido propio (la barra «Ver mi bolsa»).
public struct TindivoCTAButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    private let cornerRadius: CGFloat?

    /// `cornerRadius` en `nil` da la cápsula; con contenido de varias líneas (letra grande) se pasa un radio fijo,
    /// porque una cápsula alta se come el texto de los lados.
    public init(cornerRadius: CGFloat? = nil) {
        self.cornerRadius = cornerRadius
    }

    private var shape: AnyShape {
        cornerRadius.map { AnyShape(RoundedRectangle(cornerRadius: $0)) } ?? AnyShape(Capsule())
    }

    public func makeBody(configuration: Configuration) -> some View {
        let fill = enabled
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
