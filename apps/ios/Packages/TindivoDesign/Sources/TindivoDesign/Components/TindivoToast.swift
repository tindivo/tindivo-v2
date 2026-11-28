import SwiftUI

extension View {
    /// Un aviso breve sobre el borde de abajo («Agregado a tu bolsa»). Quien lo usa decide cuándo aparece y cuándo se
    /// va; VoiceOver lo anuncia al aparecer, porque no recibe el foco.
    public func tindivoToast(_ message: String?) -> some View {
        modifier(ToastModifier(message: message))
    }
}

private struct ToastModifier: ViewModifier {
    let message: String?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let message {
                    Text(message)
                        .tindivoText(TindivoTokens.Typography.body)
                        .foregroundStyle(Color.tindivo.onSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
                        .padding(.vertical, TindivoTokens.Spacing.spaceInner)
                        .background(
                            Color.tindivo.secondary,
                            in: RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField)
                        )
                        .padding(TindivoTokens.Spacing.spaceScreen)
                        // Con «Reducir movimiento» el aviso aparece sin deslizarse.
                        .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                        .accessibilityIdentifier("toast")
                }
            }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: message)
            .onChange(of: message) { _, new in
                if let new { AccessibilityNotification.Announcement(new).post() }
            }
    }
}

#Preview("Aviso") {
    Color.tindivo.background
        .tindivoToast("Agregado a tu bolsa")
        .onAppear { TindivoFonts.register() }
}
