import SwiftUI
import TindivoDesign

/// Actualización obligatoria (CLI-4): pantalla completa, sin salida; lo único que se puede hacer es ir a la tienda.
/// Los textos son los de `update_*` de Android, salvo el del botón (App Store en vez de tienda) y el de «Búscala en la
/// App Store» (por aprobar).
struct UpdateView: View {
    let minVersion: String?
    /// Sin el id de la App Store (`APP_STORE_ID` vacío) no hay adónde ir: en vez de un botón apagado se le dice a la
    /// persona qué hacer.
    let storeURL: URL?
    @Environment(\.openURL) private var openURL
    @AccessibilityFocusState private var titleFocused: Bool

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                content
                    .padding(TindivoTokens.Spacing.spaceScreen)
                    .frame(maxWidth: .infinity, minHeight: proxy.size.height) // centrado vertical; con letra grande, scroll
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .background(Color.tindivo.background)
        .accessibilityIdentifier("update-required")
        .task { titleFocused = true } // VoiceOver empieza por el título, no por el fondo
    }

    private var content: some View {
        VStack(spacing: TindivoTokens.Spacing.spaceGroup) {
            Image(systemName: "arrow.down.app")
                .font(.system(.largeTitle))
                .imageScale(.large)
                .foregroundStyle(Color.tindivo.primary)
                .accessibilityHidden(true)
            Text("Actualiza la app")
                .tindivoText(TindivoTokens.Typography.titleScreen)
                .foregroundStyle(Color.tindivo.ink)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($titleFocused)
            Text("Hay una versión nueva de Tindivo y necesitas instalarla para seguir usando la app.")
                .tindivoText(TindivoTokens.Typography.body)
                .foregroundStyle(Color.tindivo.ink)
                .multilineTextAlignment(.center)
            if let minVersion {
                Text("Versión mínima: \(minVersion)")
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
            if let storeURL {
                storeButton(storeURL)
            } else {
                // TODO(App Store): poner el id en APP_STORE_ID (Dev.xcconfig / Prod.xcconfig) al crear la ficha.
                Text("Búscala en la App Store")
                    .tindivoText(TindivoTokens.Typography.body)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    /// El botón es propio (con `TindivoCTAButtonStyle`) y no `TindivoPrimaryButton`: ese limita el texto a una línea, y con
    /// letra grande (AX5) el botón se cortaría.
    private func storeButton(_ url: URL) -> some View {
        Button { openURL(url) } label: {
            Text("Ir a la App Store")
                .tindivoText(TindivoTokens.Typography.cta)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: TindivoTokens.Spacing.ctaHeight)
                .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        }
        .buttonStyle(TindivoCTAButtonStyle(cornerRadius: TindivoTokens.Radius.radiusField))
    }
}

#Preview("Actualización obligatoria") {
    UpdateView(minVersion: "1.2.0", storeURL: URL(string: "https://apps.apple.com/app/id0000000000"))
        .onAppear { TindivoFonts.register() }
}

#Preview("Sin id de la App Store, letra enorme") {
    UpdateView(minVersion: nil, storeURL: nil)
        .dynamicTypeSize(.accessibility5)
        .onAppear { TindivoFonts.register() }
}

#Preview("Con la App Store, letra enorme") {
    UpdateView(minVersion: "1.2.0", storeURL: URL(string: "https://apps.apple.com/app/id0000000000"))
        .dynamicTypeSize(.accessibility5)
        .onAppear { TindivoFonts.register() }
}
