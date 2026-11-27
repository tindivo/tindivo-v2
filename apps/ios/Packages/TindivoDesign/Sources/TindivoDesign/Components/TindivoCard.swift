import SwiftUI

/// La tarjeta de Tindivo (`TindivoCard.kt`): blanca sobre el fondo de la pantalla, radio 20, sin borde y con la sombra en
/// dos capas de Android (6 y 1 de elevación, alfa .10 y .16). No añade relleno propio salvo `padding`. `background`
/// cambia el fondo (el negocio cerrado va en `surfaceSunken`).
public struct TindivoCard<Content: View>: View {
    private let padding: CGFloat
    private let background: Color
    private let content: Content

    public init(
        padding: CGFloat = 0, background: Color = Color.tindivo.surface, @ViewBuilder content: () -> Content
    ) {
        self.padding = padding
        self.background = background
        self.content = content()
    }

    public var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            // La sombra va en el fondo, no en el contenido: si no, el texto de la tarjeta también la proyecta.
            .background {
                shape.fill(background)
                    .shadow(color: Color.tindivo.ink.opacity(0.10), radius: 3, x: 0, y: 3)
                    .shadow(color: Color.tindivo.ink.opacity(0.16), radius: 0.5, x: 0, y: 0.5)
            }
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusCard, style: .continuous)
    }
}

#Preview("Tarjeta") {
    VStack(spacing: TindivoTokens.Spacing.spaceInner) {
        TindivoCard(padding: TindivoTokens.Spacing.spaceScreen) {
            Text("Pollería Don Lucho").tindivoText(TypeToken.titleCard)
        }
        TindivoCard(padding: TindivoTokens.Spacing.spaceScreen, background: Color.tindivo.surfaceSunken) {
            Text("Cerrada").tindivoText(TypeToken.titleCard)
        }
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
