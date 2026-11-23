import SwiftUI

extension View {
    /// Sacude la vista un momento cada vez que `trigger` cambia: lo que se usa para decir «mira aquí» (el grupo
    /// obligatorio que falta). Con «Reducir movimiento» no se mueve nada.
    public func tindivoShake(trigger: Int) -> some View {
        modifier(ShakeModifier(trigger: trigger))
    }
}

private struct ShakeModifier: ViewModifier {
    let trigger: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var progress: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .modifier(ShakeEffect(progress: progress))
            .onChange(of: trigger) { _, _ in
                guard !reduceMotion else { return }
                progress = 0
                withAnimation(.linear(duration: 0.4)) { progress = 1 }
            }
    }
}

/// Tres idas y vueltas de 8 pt que se apagan hacia el final.
private struct ShakeEffect: GeometryEffect {
    var progress: CGFloat

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        let offset = 8 * sin(progress * .pi * 6) * (1 - progress)
        return ProjectionTransform(CGAffineTransform(translationX: offset, y: 0))
    }
}

#Preview("Sacudida") {
    @Previewable @State var count = 0
    VStack(spacing: TindivoTokens.Spacing.spaceGroup) {
        Text("Obligatorio · elige 1")
            .tindivoText(TindivoTokens.Typography.body)
            .tindivoShake(trigger: count)
        TindivoSecondaryButton("Sacudir") { count += 1 }
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
