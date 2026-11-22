import SwiftUI

/// El acceso que pide el canon (`Docs/negocio/sistema-de-diseno.md`): `Color.tindivo.primary`.
/// Los valores salen de `Generated/TindivoTokens.swift`, que no se edita a mano.
extension Color {
    public static let tindivo = TindivoTokens.Colors.self
}

extension View {
    /// Aplica un estilo de texto del canon: Geist, tamaño, peso e interlineado, todo escalado con Dynamic Type.
    /// SwiftUI no fija la altura de línea: la aproxima con el espaciado entre líneas (`line − size`).
    public func tindivoText(_ token: TypeToken) -> some View {
        modifier(TindivoTextModifier(token: token))
    }

    /// Las capas de sombra de una elevación del canon, en orden.
    public func tindivoElevation(_ layers: [ShadowLayer]) -> some View {
        layers.reduce(AnyView(self)) { view, layer in
            AnyView(view.shadow(color: layer.color, radius: layer.blur / 2, x: layer.x, y: layer.y))
        }
    }
}

private struct TindivoTextModifier: ViewModifier {
    let token: TypeToken
    @ScaledMetric private var spacing: CGFloat

    init(token: TypeToken) {
        self.token = token
        _spacing = ScaledMetric(wrappedValue: max(0, (token.line ?? token.size) - token.size), relativeTo: token.systemStyle)
    }

    func body(content: Content) -> some View {
        content.font(.tindivo(token)).lineSpacing(spacing)
    }
}
