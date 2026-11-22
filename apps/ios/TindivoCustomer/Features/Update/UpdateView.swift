import SwiftUI
import TindivoDesign

/// Actualización obligatoria (CLI-4): pantalla completa, sin salida; lo único que se puede hacer es ir a la tienda.
/// Los textos son los de `update_*` de Android, salvo el del botón (App Store en vez de tienda).
struct UpdateView: View {
    let minVersion: String?
    /// Sin el id de la App Store (`APP_STORE_ID` vacío) no hay adónde ir y el botón queda deshabilitado.
    let storeURL: URL?
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
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
                Text("Hay una versión nueva de Tindivo y necesitas instalarla para seguir usando la app.")
                    .tindivoText(TindivoTokens.Typography.body)
                    .foregroundStyle(Color.tindivo.ink)
                    .multilineTextAlignment(.center)
                if let minVersion {
                    Text("Versión mínima: \(minVersion)")
                        .tindivoText(TindivoTokens.Typography.bodySecondary)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                }
                // TODO(App Store): poner el id en APP_STORE_ID (Dev.xcconfig / Prod.xcconfig) al crear la ficha.
                TindivoPrimaryButton("Ir a la App Store") {
                    if let storeURL { openURL(storeURL) }
                }
                .disabled(storeURL == nil)
            }
            .padding(TindivoTokens.Spacing.spaceScreen)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(Color.tindivo.background)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("update-required")
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
