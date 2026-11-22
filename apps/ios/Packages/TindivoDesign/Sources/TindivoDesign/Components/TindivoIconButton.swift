import SwiftUI

/// Un botón de solo icono: área táctil de `touchTarget` y etiqueta para VoiceOver, que es obligatoria (CLI-13).
public struct TindivoIconButton: View {
    private let icon: TindivoIcon
    private let label: LocalizedStringKey
    private let tint: Color
    private let action: () -> Void

    public init(
        _ icon: TindivoIcon,
        label: LocalizedStringKey,
        tint: Color = Color.tindivo.ink,
        action: @escaping () -> Void
    ) {
        self.icon = icon
        self.label = label
        self.tint = tint
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(tindivo: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(tint)
                .frame(minWidth: TindivoTokens.Spacing.touchTarget, minHeight: TindivoTokens.Spacing.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

#Preview("Botón de icono") {
    HStack {
        TindivoIconButton(.back, label: "Volver") {}
        TindivoIconButton(.search, label: "Buscar") {}
        TindivoIconButton(.close, label: "Cerrar") {}
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
}
