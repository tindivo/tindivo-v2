import SwiftUI
import TindivoDesign

/// La barra superior de la ficha (`DishTopBar` de `DishPage.kt`): «Volver» en un círculo blanco sobre la foto; al bajar,
/// la barra se vuelve blanca con su línea y dice el nombre del plato. `progress` va de 0 (foto a la vista) a 1 (barra
/// sólida). Ocupa 56 bajo la barra de estado.
struct DishTopBar: View {
    static let height: CGFloat = 56
    private static let circle: CGFloat = 40

    let name: String
    /// 0 con la foto a la vista, 1 con la barra ya sólida.
    let progress: Double
    let onBack: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            backButton
            Text(name)
                .tindivoText(TypeToken.titleCard)
                .foregroundStyle(Color.tindivo.ink)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
                .opacity(progress)
                // El nombre ya se lee como encabezado en la ficha: aquí es solo el título visual de la barra.
                .accessibilityHidden(true)
            Spacer(minLength: 0).frame(width: 4)
        }
        .padding(.horizontal, 4)
        .accessibilityElement(children: .contain)
        .frame(height: Self.height)
        // Como las barras del sistema: con letra de accesibilidad no crece más, porque no cabría en los 56 de alto.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .background {
            Color.tindivo.surface
                .overlay(alignment: .bottom) { Color.tindivo.outlineVariant.frame(height: 1) }
                .ignoresSafeArea(edges: .top)
                .opacity(progress)
        }
    }

    /// Un círculo blanco con sombra sobre la foto, que se funde con la barra al volverse sólida.
    private var backButton: some View {
        Button(action: onBack) {
            Image(tindivo: .back)
                .accessibilityHidden(true)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Color.tindivo.ink)
                .frame(width: Self.circle, height: Self.circle)
                .background {
                    Circle()
                        .fill(Color.white.opacity(0.92))
                        .shadow(color: Color.tindivo.ink.opacity(0.25), radius: 2, y: 1)
                        .opacity(1 - progress)
                }
                .frame(minWidth: TindivoTokens.Spacing.touchTarget, minHeight: TindivoTokens.Spacing.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("Volver"))
        // Lo primero que lee VoiceOver, antes del contenido que está debajo.
        .accessibilitySortPriority(1)
        .accessibilityIdentifier("dish.close")
    }
}

#if DEBUG
#Preview("Barra del plato") {
    VStack(spacing: 24) {
        DishTopBar(name: "1/4 de pollo a la brasa", progress: 0, onBack: {})
            .background(Color.tindivo.brand)
        DishTopBar(name: "1/4 de pollo a la brasa", progress: 1, onBack: {})
    }
    .onAppear { TindivoFonts.register() }
}
#endif
