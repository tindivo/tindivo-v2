import SwiftUI
import TindivoDesign

/// La barra de las cuatro pestañas (`BottomTabBar.kt`): alto mínimo 80, la pestaña activa con una píldora de 56×32 en
/// `primaryContainer`, icono de 24 y el texto `labelMedium` (negrita y de marca en la activa, semibold en las demás).
/// Es propia y no la de la plataforma porque `TabView` no deja dibujar esa píldora. Cada pestaña es un botón de 48 como
/// mínimo; la activa lleva el rasgo «seleccionado» para VoiceOver.
struct RootTabBar: View {
    let selected: RootTab
    let onSelect: (RootTab) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(RootTab.allCases, id: \.self) { tab in
                item(tab)
            }
        }
        .frame(minHeight: 80)
        .frame(maxWidth: .infinity)
        .background(Color.tindivo.surface.shadow(.drop(color: Color.tindivo.ink.opacity(0.10), radius: 4, y: -2)))
        // Como la barra de la plataforma, el texto deja de crecer pasada la letra grande: con las tallas de accesibilidad
        // los nombres de las cuatro pestañas no caben en un cuarto de pantalla.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tab.bar")
    }

    private func item(_ tab: RootTab) -> some View {
        let isSelected = tab == selected
        let tint = isSelected ? Color.tindivo.primaryText : Color.tindivo.inkSecondary
        return Button {
            onSelect(tab)
        } label: {
            VStack(spacing: 2) {
                Image(tindivo: tab.icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 56, height: 32)
                    .background(isSelected ? Color.tindivo.primaryContainer : Color.clear, in: Capsule())
                    .accessibilityHidden(true)
                Text(tab.title)
                    .tindivoText(TypeToken.labelMedium)
                    .fontWeight(isSelected ? .bold : .semibold)
                    .foregroundStyle(tint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: TindivoTokens.Spacing.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier(tab.identifier)
    }
}

extension View {
    /// Pone la barra de pestañas abajo de una pantalla raíz. Va dentro del `NavigationStack` de la pestaña: al empujar
    /// una pantalla, la barra se va con la raíz, como la de la plataforma.
    func rootTabBar(selected: RootTab, onSelect: @escaping (RootTab) -> Void) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) { RootTabBar(selected: selected, onSelect: onSelect) }
    }
}

#if DEBUG
#Preview("Barra de pestañas") {
    VStack {
        Spacer()
        RootTabBar(selected: .home, onSelect: { _ in })
        RootTabBar(selected: .courier, onSelect: { _ in })
    }
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
#endif
