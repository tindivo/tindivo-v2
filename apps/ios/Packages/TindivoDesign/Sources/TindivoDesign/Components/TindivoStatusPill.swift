import SwiftUI

/// Una cápsula de estado («Abierto», «Obligatorio», «Listo», «2 abiertos ahora»): letra de 13 en negrita, relleno 10×4 y
/// un icono opcional de 14. El color no es la única señal: lleva texto.
public struct TindivoStatusPill: View {
    public enum Tone: Sendable {
        /// Algo que falta o que cierra (`warningContainer`).
        case warning
        /// Todo bien (`successContainer`, el `tertiaryContainer` de Android).
        case success
        /// Dato sin carga (`surfaceSunken`).
        case neutral
        /// Marca (`primaryContainer` con texto de marca).
        case brand
    }

    private let text: String
    private let tone: Tone
    private let icon: TindivoIcon?

    public init(_ text: String, tone: Tone = .neutral, icon: TindivoIcon? = nil) {
        self.text = text
        self.tone = tone
        self.icon = icon
    }

    public var body: some View {
        HStack(spacing: 4) {
            if let icon {
                Image(tindivo: icon)
                    .font(.system(size: 14, weight: .bold))
                    .accessibilityHidden(true)
            }
            Text(verbatim: text)
                .tindivoText(TindivoTokens.Typography.bodySecondary)
                .fontWeight(.bold)
        }
        .foregroundStyle(content)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        // Cápsula con una línea; con letra enorme el texto pasa a varias y la esquina fija evita el óvalo.
        .background(container, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var container: Color {
        switch tone {
        case .warning: Color.tindivo.warningContainer
        case .success: Color.tindivo.successContainer
        case .neutral: Color.tindivo.surfaceSunken
        case .brand: Color.tindivo.primaryContainer
        }
    }

    private var content: Color {
        switch tone {
        case .warning: Color.tindivo.warning
        case .success: Color.tindivo.success
        case .neutral: Color.tindivo.inkSecondary
        case .brand: Color.tindivo.primaryText
        }
    }
}

#Preview("Píldoras de estado") {
    VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
        TindivoStatusPill("Cerrado · abre mañana 12:00", tone: .warning)
        TindivoStatusPill("Abierto", tone: .success)
        TindivoStatusPill("Listo", tone: .success, icon: .done)
        TindivoStatusPill("Opcional")
        TindivoStatusPill("1 de 2 listas", tone: .brand)
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
