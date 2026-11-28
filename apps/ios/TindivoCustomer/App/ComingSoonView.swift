import SwiftUI
import TindivoDesign

/// La pantalla de una pestaña que aún no existe en iPhone (Entregas, Pedidos, Cuenta): el título de la pestaña, la
/// píldora «Próximamente» y una línea.
struct ComingSoonView: View {
    let title: LocalizedStringResource
    let icon: TindivoIcon
    let identifier: String

    init(tab: RootTab) {
        self.init(title: tab.title, icon: tab.icon, identifier: "comingSoon.\(tab.identifier)")
    }

    /// Para lo que aún no existe y no es una pestaña (hoy, el checkout al que lleva «Continuar»).
    init(title: LocalizedStringResource, icon: TindivoIcon, identifier: String) {
        self.title = title
        self.icon = icon
        self.identifier = identifier
    }

    var body: some View {
        VStack(spacing: TindivoTokens.Spacing.spaceInner) {
            TindivoRoundIcon(icon, size: 64)
            Text(title)
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
        .accessibilityIdentifier(identifier)
    }
}

#if DEBUG
#Preview("Próximamente") {
    ComingSoonView(tab: .courier)
        .onAppear { TindivoFonts.register() }
}
#endif
