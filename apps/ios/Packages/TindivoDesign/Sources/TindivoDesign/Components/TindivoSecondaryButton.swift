import SwiftUI

/// El botón secundario: contorno `outline`, texto `ink`, `secondaryHeight` de alto, en píldora (canon §3 y §5).
public struct TindivoSecondaryButton: View {
    private let title: LocalizedStringKey
    private let action: () -> Void
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.dynamicTypeSize) private var typeSize

    public init(_ title: LocalizedStringKey, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    /// Con letra grande el texto pasa a dos líneas y el contorno a rectángulo redondeado: una cápsula alta se come el
    /// texto de los lados.
    private var shape: AnyShape {
        typeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField)) : AnyShape(Capsule())
    }

    public var body: some View {
        Button(action: action) {
            Text(title)
                .tindivoText(TindivoTokens.Typography.chip)
                .foregroundStyle(isEnabled ? Color.tindivo.ink : Color.tindivo.onDisabled)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
                .padding(.vertical, typeSize.isAccessibilitySize ? TindivoTokens.Spacing.spaceInner : 0)
                .frame(maxWidth: .infinity, minHeight: TindivoTokens.Spacing.secondaryHeight)
                .overlay(shape.stroke(isEnabled ? Color.tindivo.outline : Color.tindivo.disabled, lineWidth: 1))
                .contentShape(shape)
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
