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

    /// Las capas de sombra de una elevación del canon, en orden. Son como mucho `TindivoElevationModifier.maxLayers`
    /// (las elevaciones del canon tienen una o dos): un modificador de forma fija en vez de una cadena de `AnyView`.
    public func tindivoElevation(_ layers: [ShadowLayer]) -> some View {
        modifier(TindivoElevationModifier(layers: layers))
    }
}

/// Aplica hasta dos capas de sombra; una capa que falta se queda en una sombra transparente, que no pinta nada.
struct TindivoElevationModifier: ViewModifier {
    static let maxLayers = 2
    let layers: [ShadowLayer]

    @ViewBuilder
    func body(content: Content) -> some View {
        if layers.isEmpty {
            content
        } else {
            content
                .shadow(color: color(0), radius: radius(0), x: x(0), y: y(0))
                .shadow(color: color(1), radius: radius(1), x: x(1), y: y(1))
        }
    }

    private func color(_ index: Int) -> Color { layers.indices.contains(index) ? layers[index].color : .clear }
    private func radius(_ index: Int) -> CGFloat { layers.indices.contains(index) ? layers[index].blur / 2 : 0 }
    private func x(_ index: Int) -> CGFloat { layers.indices.contains(index) ? layers[index].x : 0 }
    private func y(_ index: Int) -> CGFloat { layers.indices.contains(index) ? layers[index].y : 0 }
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
