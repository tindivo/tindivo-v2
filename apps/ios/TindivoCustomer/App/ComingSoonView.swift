import SwiftUI
import TindivoDesign

/// La pantalla de una pestaña que aún no existe en iPhone (Entregas, Pedidos, Cuenta): el título de la pestaña, la
/// píldora «Próximamente» y una línea.
struct ComingSoonView: View {
    let tab: RootTab

    var body: some View {
        VStack(spacing: TindivoTokens.Spacing.spaceInner) {
            TindivoRoundIcon(tab.icon, size: 64)
            Text(tab.title)
                .tindivoText(TypeToken.greeting)
                .foregroundStyle(Color.tindivo.ink)
                .accessibilityAddTraits(.isHeader)
            TindivoStatusPill(String(localized: "Próximamente"), tone: .brand)
            Text("Muy pronto en la app de iPhone.")
                .tindivoText(TindivoTokens.Typography.body)
                .foregroundStyle(Color.tindivo.inkSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(TindivoTokens.Spacing.spaceScreen)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.tindivo.background)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("comingSoon.\(tab.identifier)")
    }
}

#if DEBUG
#Preview("Próximamente") {
    ComingSoonView(tab: .courier)
        .onAppear { TindivoFonts.register() }
}
#endif
