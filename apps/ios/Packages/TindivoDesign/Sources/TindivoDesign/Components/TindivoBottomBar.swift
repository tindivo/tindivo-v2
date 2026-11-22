import SwiftUI

/// La barra de acción fija de abajo: `surface`, `elevation2`, relleno 12/16 y el aire de la barra de gestos (canon §5).
/// Va en un `safeAreaInset(edge: .bottom)`: la lista de arriba deja de quedar tapada.
public struct TindivoBottomBar<Content: View>: View {
    private let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        content
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            .padding(.vertical, TindivoTokens.Spacing.spaceInner)
            .frame(maxWidth: .infinity)
            .background(Color.tindivo.surface.ignoresSafeArea(edges: .bottom))
            .tindivoElevation(TindivoTokens.Elevation.elevation2)
    }
}

#Preview("Barra inferior") {
    Color.tindivo.background
        .safeAreaInset(edge: .bottom) {
            TindivoBottomBar {
                TindivoPrimaryButton("Continuar") {}
            }
        }
        .onAppear { TindivoFonts.register() }
}
