import SwiftUI

/// El acceso que pide el canon (`Docs/negocio/sistema-de-diseno.md`): `Color.tindivo.primary`.
/// Los valores salen de `Generated/TindivoTokens.swift`, que no se edita a mano.
extension Color {
    public static let tindivo = TindivoTokens.Colors.self
}

extension View {
    /// Aplica un estilo de texto del canon: Geist, tamaño, peso e interlineado.
    /// SwiftUI no fija la altura de línea: la aproxima con el espaciado entre líneas (`line − size`).
    public func tindivoText(_ token: TypeToken) -> some View {
        font(.tindivo(token))
            .lineSpacing(max(0, (token.line ?? token.size) - token.size))
    }

    /// Las capas de sombra de una elevación del canon, en orden.
    public func tindivoElevation(_ layers: [ShadowLayer]) -> some View {
        layers.reduce(AnyView(self)) { view, layer in
            AnyView(view.shadow(color: layer.color, radius: layer.blur / 2, x: layer.x, y: layer.y))
        }
    }
}
