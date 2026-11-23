import SwiftUI
import TindivoDesign

/// Aviso de sistema antiguo (D-58, paridad con `OsNotice.kt` de Android): el iOS del aparato está por debajo del mínimo de
/// `/config`. Solo avisa: la persona sigue usando la app y puede cerrarlo. Textos de `os_notice_*` de Android con
/// «iPhone»/«iOS» en lugar de «Android» (por aprobar).
struct OSNoticeView: View {
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
            Text("Tu iPhone es antiguo")
                .tindivoText(TindivoTokens.Typography.body)
                .bold()
                .foregroundStyle(Color.tindivo.ink)
            Text("Puedes seguir usando Tindivo, pero algunas funciones podrían no ir bien en esta versión de iOS.")
                .tindivoText(TindivoTokens.Typography.bodySecondary)
                .foregroundStyle(Color.tindivo.ink)
            Button(action: onDismiss) {
                // El área de 44 pt va DENTRO de la etiqueta: si no, el toque no la alcanza.
                Text("Entendido")
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityIdentifier("os-notice.dismiss")
        }
        .padding(TindivoTokens.Spacing.spaceScreen)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.tindivo.surface)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("os-notice")
    }
}

#Preview("Aviso de iOS antiguo") {
    OSNoticeView {}.onAppear { TindivoFonts.register() }
}
