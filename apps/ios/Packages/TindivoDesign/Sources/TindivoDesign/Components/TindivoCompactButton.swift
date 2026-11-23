import SwiftUI

/// Un botón corto de contorno para dejarlo junto a una tarjeta («Elegir», «Editar selección»): píldora de `touchTarget`
/// de alto, texto `chip` en `ink`. Con letra grande el texto pasa a dos líneas y el contorno a rectángulo redondeado.
public struct TindivoCompactButton: View {
    private let title: String
    private let action: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    /// `title` ya viene traducido; un `accessibilityLabel` aparte puede sumar el contexto («Elegir Pollo entero»).
    public init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    private var shape: AnyShape {
        typeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField)) : AnyShape(Capsule())
    }

    public var body: some View {
        Button(action: action) {
            Text(verbatim: title)
                .tindivoText(TindivoTokens.Typography.chip)
                .foregroundStyle(Color.tindivo.ink)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
                .padding(.vertical, 6)
                .frame(minHeight: TindivoTokens.Spacing.touchTarget)
                .overlay(shape.stroke(Color.tindivo.outline, lineWidth: 1))
                .contentShape(shape)
        }
        .buttonStyle(.plain)
    }
}

#Preview("Botón corto") {
    VStack(spacing: TindivoTokens.Spacing.spaceInner) {
        TindivoCompactButton("Elegir") {}
        TindivoCompactButton("Editar selección") {}
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
