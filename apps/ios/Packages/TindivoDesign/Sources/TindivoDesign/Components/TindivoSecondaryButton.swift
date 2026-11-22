import SwiftUI

/// El botón secundario: contorno `outline`, texto `ink`, `secondaryHeight` de alto, en píldora (canon §3 y §5).
public struct TindivoSecondaryButton: View {
    private let title: LocalizedStringKey
    private let action: () -> Void
    @Environment(\.isEnabled) private var isEnabled

    public init(_ title: LocalizedStringKey, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Text(title)
                .tindivoText(TindivoTokens.Typography.chip)
                .foregroundStyle(isEnabled ? Color.tindivo.ink : Color.tindivo.onDisabled)
                .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
                .frame(maxWidth: .infinity, minHeight: TindivoTokens.Spacing.secondaryHeight)
                .overlay(Capsule().stroke(isEnabled ? Color.tindivo.outline : Color.tindivo.disabled, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Un texto que se toca («Reintentar», «Vaciar»), en `primaryText` y con el área táctil completa.
public struct TindivoTextButton: View {
    private let title: LocalizedStringKey
    private let action: () -> Void

    public init(_ title: LocalizedStringKey, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Text(title)
                .tindivoText(TindivoTokens.Typography.chip)
                .foregroundStyle(Color.tindivo.primaryText)
                .padding(.horizontal, TindivoTokens.Spacing.spaceInner)
                .frame(minHeight: TindivoTokens.Spacing.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview("Botones secundarios") {
    VStack(spacing: TindivoTokens.Spacing.spaceInner) {
        TindivoSecondaryButton("+ Agregar más") {}
        TindivoSecondaryButton("Llamar") {}.disabled(true)
        TindivoTextButton("Vaciar") {}
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
}
