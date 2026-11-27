import SwiftUI
import TindivoDesign

/// La barra de la bolsa (`CartTopBar` de Android): blanca y con sombra, «Volver», «Tu bolsa» y el contador en una
/// píldora crema. `countLabel` es `nil` con la bolsa vacía: entonces no hay contador. Con letra de accesibilidad el
/// contador baja bajo el título: al lado no cabe.
struct CartTopBar: View {
    let countLabel: String?
    let onBack: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 4) {
            TindivoIconButton(.back, label: "Volver", action: onBack)
                .accessibilityIdentifier("cart.back")
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    title; counter
                    Spacer(minLength: 0)
                }
                VStack(alignment: .leading, spacing: 4) {
                    title; counter
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Como las barras del sistema y la de la carta (`BusinessTopBar`): no crece más que xxxLarge, para que con letra
        // de accesibilidad la bolsa siga teniendo sitio.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .background {
            Color.tindivo.surface
                .shadow(color: Color.tindivo.ink.opacity(0.14), radius: 3, y: 2)
                .ignoresSafeArea(edges: .top)
        }
    }

    private var title: some View {
        Text("Tu bolsa")
            .tindivoText(TindivoTokens.Typography.titleSection)
            .foregroundStyle(Color.tindivo.ink)
            .lineLimit(1)
            .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder private var counter: some View {
        if let countLabel {
            Text(countLabel)
                .tindivoText(TindivoTokens.Typography.bodySecondary)
                .fontWeight(.bold)
                .foregroundStyle(Color.tindivo.onPrimaryContainer)
                .lineLimit(1)
                .padding(.horizontal, 10)
                .padding(.vertical, 3)
                .background(Color.tindivo.primaryContainer, in: Capsule())
                .accessibilityIdentifier("cart.count")
        }
    }
}

#if DEBUG
#Preview("Barra de la bolsa") {
    VStack(spacing: 24) {
        CartTopBar(countLabel: "3 productos", onBack: {})
        CartTopBar(countLabel: nil, onBack: {})
    }
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
#endif
