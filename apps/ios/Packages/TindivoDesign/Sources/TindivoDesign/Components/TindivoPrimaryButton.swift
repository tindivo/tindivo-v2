import SwiftUI

/// El CTA de la pantalla: relleno `primary`, 56 pt de alto, texto `cta` en blanco y sombra `elevation3` (canon §2–§5).
///
/// Mientras `loading` es `true`, el botón deja de responder pero conserva su color, y VoiceOver sigue leyendo la
/// etiqueta y anuncia que está en curso: una segunda pulsación no repite la acción (paridad con Android).
public struct TindivoPrimaryButton: View {
    private let title: LocalizedStringKey
    private let loading: Bool
    private let action: () -> Void
    @Environment(\.isEnabled) private var isEnabled

    public init(_ title: LocalizedStringKey, loading: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.loading = loading
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            ZStack {
                Text(title)
                    .tindivoText(TindivoTokens.Typography.cta)
                    .lineLimit(1)
                    .opacity(loading ? 0 : 1)
                if loading {
                    ProgressView().tint(Color.tindivo.onPrimary)
                }
            }
            .frame(maxWidth: .infinity, minHeight: TindivoTokens.Spacing.ctaHeight)
        }
        .buttonStyle(PrimaryStyle(enabled: isEnabled))
        .allowsHitTesting(!loading)
        .accessibilityValue(loading ? Text("En curso") : Text(""))
    }
}

private struct PrimaryStyle: ButtonStyle {
    let enabled: Bool

    func makeBody(configuration: Configuration) -> some View {
        let fill = enabled
            ? (configuration.isPressed ? Color.tindivo.primaryPressed : Color.tindivo.primary)
            : Color.tindivo.disabled
        configuration.label
            .foregroundStyle(enabled ? Color.tindivo.onPrimary : Color.tindivo.onDisabled)
            .background(fill, in: Capsule())
            .tindivoElevation(enabled ? TindivoTokens.Elevation.elevation3 : [])
            .contentShape(Capsule())
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
