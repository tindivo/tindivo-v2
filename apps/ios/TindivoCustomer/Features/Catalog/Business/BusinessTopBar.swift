import SwiftUI
import TindivoDesign

/// La barra superior de la carta (`BusinessTopBar.kt`): flota sobre la portada, con «Atrás» y «Buscar» en círculos
/// blancos de 40 (toque de 48); al pasar la portada se vuelve blanca con una línea abajo y dice el nombre y el estado
/// (CA-CAT-P5). `title` es `nil` sin la carta cargada: entonces solo hay «Atrás». Ocupa 56 bajo la barra de estado.
struct BusinessTopBar: View {
    static let height: CGFloat = 56
    private static let circle: CGFloat = 40

    /// `true` con la portada ya pasada: la barra es blanca y lleva el nombre.
    let solid: Bool
    let title: String?
    let status: String?
    let onBack: () -> Void
    let onSearch: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            roundButton(.back, label: "Volver", identifier: "business.back", action: onBack)
            titleView
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 8)
                .opacity(solid ? 1 : 0)
                .accessibilityHidden(!solid || title == nil)
            if title != nil {
                roundButton(.search, label: "Buscar en la carta", identifier: "menu.searchButton", action: onSearch)
            }
        }
        .padding(.horizontal, 4)
        .frame(height: Self.height)
        .background(barBackground)
    }

    /// Blanca y con su línea al volverse sólida; la franja de la barra de estado se pinta con ella.
    private var barBackground: some View {
        Color.tindivo.surface
            .overlay(alignment: .bottom) { Color.tindivo.outlineVariant.frame(height: 1) }
            .ignoresSafeArea(edges: .top)
            .opacity(solid ? 1 : 0)
    }

    @ViewBuilder private var titleView: some View {
        if let title {
            VStack(spacing: 0) {
                Text(title)
                    .tindivoText(TindivoTokens.Typography.chip)
                    .foregroundStyle(Color.tindivo.ink)
                    .lineLimit(1)
                if let status {
                    Text(status)
                        .tindivoText(TypeToken.labelSmall)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                        .lineLimit(1)
                }
            }
            // Como las barras del sistema (y `RootTabBar`): con letra de accesibilidad el título no crece más, porque no
            // cabría en los 56 de alto. El nombre completo se lee en la cabecera.
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("business.titleBar")
        }
    }

    /// Un círculo blanco con sombra sobre la portada, que se funde con la barra al volverse sólida.
    private func roundButton(_ icon: TindivoIcon, label: LocalizedStringKey, identifier: String, action: @escaping () -> Void)
        -> some View
    {
        Button(action: action) {
            Image(tindivo: icon)
                .accessibilityHidden(true)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Color.tindivo.ink)
                .frame(width: Self.circle, height: Self.circle)
                .background {
                    Circle()
                        .fill(Color.white.opacity(0.92))
                        .shadow(color: Color.tindivo.ink.opacity(0.25), radius: 2, y: 1)
                        .opacity(solid ? 0 : 1)
                }
                .frame(minWidth: TindivoTokens.Spacing.touchTarget, minHeight: TindivoTokens.Spacing.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityIdentifier(identifier)
    }
}

/// La barra de la búsqueda dentro de la carta: «Volver», el campo con el foco y «Limpiar búsqueda» si hay texto.
struct BusinessSearchBar: View {
    let businessName: String
    let query: String
    let onQueryChange: (String) -> Void
    let onBack: () -> Void
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 0) {
            TindivoIconButton(.back, label: "Volver", action: onBack)
            TextField(
                "", text: Binding(get: { query }, set: { onQueryChange($0) }),
                prompt: Text(String(localized: "Buscar en \(businessName)"))
            )
            .tindivoText(TindivoTokens.Typography.body)
            .submitLabel(.search)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($focused)
            .task { focused = true }
            .accessibilityIdentifier("menu.searchField")
            if !query.isEmpty {
                TindivoIconButton(.close, label: "Limpiar búsqueda") { onQueryChange("") }
            }
        }
        .padding(.horizontal, 4)
        // Mínimo, no fijo: con letra de accesibilidad el campo crece y no se corta.
        .frame(minHeight: BusinessTopBar.height)
        .background {
            Color.tindivo.surface
                .overlay(alignment: .bottom) { Color.tindivo.outlineVariant.frame(height: 1) }
                .ignoresSafeArea(edges: .top)
        }
    }
}

#if DEBUG
#Preview("Barra de la carta") {
    VStack(spacing: 24) {
        BusinessTopBar(solid: false, title: "La Florencia", status: "Abierto · cierra 23:00", onBack: {}, onSearch: {})
            .background(Color.tindivo.brand)
        BusinessTopBar(solid: true, title: "La Florencia", status: "Abierto · cierra 23:00", onBack: {}, onSearch: {})
        BusinessSearchBar(businessName: "La Florencia", query: "cevi", onQueryChange: { _ in }, onBack: {})
    }
    .onAppear { TindivoFonts.register() }
}
#endif
