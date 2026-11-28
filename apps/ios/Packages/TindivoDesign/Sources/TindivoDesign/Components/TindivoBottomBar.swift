import SwiftUI

/// La barra de acción fija de abajo (`TindivoBottomBar` de Android): `surface`, esquinas superiores de 28, sombra hacia
/// arriba, relleno 16/12/16 y el aire de la barra de gestos. Con `leading` lleva un control a la izquierda (el selector
/// de cantidad) y el contenido ocupa el ancho que sobra. Va en un `safeAreaInset(edge: .bottom)`: la lista de arriba
/// deja de quedar tapada.
public struct TindivoBottomBar<Leading: View, Content: View>: View {
    private let leading: Leading
    private let content: Content

    public init(@ViewBuilder leading: () -> Leading, @ViewBuilder content: () -> Content) {
        self.leading = leading()
        self.content = content()
    }

    public var body: some View {
        HStack(spacing: TindivoTokens.Spacing.spaceInner) {
            leading
            content.frame(maxWidth: .infinity)
        }
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        .padding(.vertical, TindivoTokens.Spacing.spaceInner)
        .frame(maxWidth: .infinity)
        .background {
            UnevenRoundedRectangle(
                topLeadingRadius: TindivoTokens.Radius.radiusSheet, topTrailingRadius: TindivoTokens.Radius.radiusSheet,
                style: .continuous
            )
            .fill(Color.tindivo.surface)
            .shadow(color: Color.tindivo.ink.opacity(0.12), radius: 6, x: 0, y: -2)
            .ignoresSafeArea(edges: .bottom)
        }
    }
}

extension TindivoBottomBar where Leading == EmptyView {
    public init(@ViewBuilder content: () -> Content) {
        self.init(leading: { EmptyView() }, content: content)
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

#Preview("Barra inferior con cantidad") {
    Color.tindivo.background
        .safeAreaInset(edge: .bottom) {
            TindivoBottomBar {
                TindivoStepper(
                    style: .filledPill, quantity: 2, label: "Cantidad", canDecrease: true, canIncrease: true,
                    decreaseLabel: "Una menos", increaseLabel: "Una más", onDecrease: {}, onIncrease: {}
                )
            } content: {
                TindivoPrimaryButton("Agregar · S/ 24.00") {}
            }
        }
        .onAppear { TindivoFonts.register() }
}
