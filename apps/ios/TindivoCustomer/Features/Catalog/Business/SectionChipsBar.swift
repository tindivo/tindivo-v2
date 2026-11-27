import SwiftUI
import TindivoDesign

/// La fila de chips que sigue a la sección visible (`SectionChips.kt`), con el botón del índice a la derecha desde 5
/// secciones. Cada chip es una píldora de 40 en un toque de 48: la activa, rellena de `ink` con texto blanco; las demás,
/// blancas con borde de 1 en `outline`. Se centra sola. Cuántas secciones hay y desde cuántas aparece cada cosa lo decide
/// `BusinessScreenModel.sectionBar`; aquí solo se dibuja.
struct SectionChipsBar: View {
    let bar: BusinessScreenModel.SectionBar
    let onSelect: (Int) -> Void
    let onShowIndex: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 0) {
                        ForEach(Array(bar.names.enumerated()), id: \.offset) { index, name in
                            chip(name, index: index)
                        }
                    }
                    .padding(.horizontal, 12)
                }
                .onChange(of: bar.selected) { _, new in
                    guard let id = bar.ids[safe: new] else { return }
                    if reduceMotion {
                        proxy.scrollTo(id, anchor: .center)
                    } else {
                        withAnimation { proxy.scrollTo(id, anchor: .center) }
                    }
                }
            }
            if bar.showsIndex { indexButton }
        }
        // `ScrollViewReader` acepta toda la altura que se le ofrece: dentro de un `safeAreaInset` tapaba la carta
        // entera. La barra mide lo que miden sus chips (y crece con la letra grande).
        .fixedSize(horizontal: false, vertical: true)
        .background(Color.tindivo.surface)
    }

    /// El índice de secciones: botón redondo de 48 con la cuadrícula y el total en una insignia.
    private var indexButton: some View {
        Button(action: onShowIndex) {
            Image(tindivo: .index)
                .accessibilityHidden(true)
                .font(.system(size: 20))
                .foregroundStyle(Color.tindivo.ink)
                .frame(width: TindivoTokens.Spacing.touchTarget, height: TindivoTokens.Spacing.touchTarget)
                .background(Color.tindivo.surface, in: Circle())
                .overlay { Circle().strokeBorder(Color.tindivo.outline, lineWidth: 1) }
                .overlay(alignment: .topTrailing) {
                    Text(verbatim: "\(bar.names.count)")
                        .tindivoText(TypeToken.labelSmall)
                        .monospacedDigit()
                        .foregroundStyle(Color.tindivo.onPrimary)
                        .padding(.horizontal, 5)
                        .frame(minWidth: 20, minHeight: 20)
                        .background(Color.tindivo.ink, in: Capsule())
                        .offset(x: 4, y: -2)
                }
        }
        .buttonStyle(.plain)
        .padding(.leading, 4)
        .padding(.trailing, 12)
        .accessibilityLabel(Text("Ver las \(bar.names.count) secciones de la carta"))
        .accessibilityIdentifier("menu.indexButton")
    }

    private func chip(_ name: String, index: Int) -> some View {
        let isSelected = index == bar.selected
        return Button {
            onSelect(index)
        } label: {
            Text(name)
                .tindivoText(TypeToken.bodyMedium)
                .fontWeight(.semibold)
                .foregroundStyle(isSelected ? Color.tindivo.surface : Color.tindivo.ink)
                .lineLimit(1)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .frame(minHeight: 40)
                .background(isSelected ? Color.tindivo.ink : Color.tindivo.surface, in: Capsule())
                .overlay { if !isSelected { Capsule().strokeBorder(Color.tindivo.outline, lineWidth: 1) } }
                .padding(.horizontal, 4)
                .frame(minHeight: TindivoTokens.Spacing.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
        .id(bar.ids[safe: index] ?? "")
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

/// La hoja con todas las secciones de la carta; tocar una la cierra y salta a ella.
struct SectionIndexSheet: View {
    let sections: [MenuCategory]
    /// Los platos de la carta, sin contar dos veces los de «Destacados» (`BusinessDetail.dishCount`).
    let total: Int
    let onSelect: (Int) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Todas las secciones")
                        .tindivoText(TindivoTokens.Typography.titleSection)
                        .foregroundStyle(Color.tindivo.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text(dishesText(total))
                        .tindivoText(TindivoTokens.Typography.body)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                }
                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: TindivoTokens.Spacing.spaceInner), GridItem(.flexible())],
                    spacing: TindivoTokens.Spacing.spaceInner
                ) {
                    ForEach(Array(sections.enumerated()), id: \.element.id) { index, section in
                        card(section, index: index)
                    }
                }
            }
            .padding(TindivoTokens.Spacing.spaceScreen)
        }
        .background(Color.tindivo.background)
        .presentationDetents([.medium, .large])
        .presentationCornerRadius(TindivoTokens.Radius.radiusSheet)
    }

    private func card(_ section: MenuCategory, index: Int) -> some View {
        Button {
            onSelect(index)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(section.name)
                    .tindivoText(TindivoTokens.Typography.body)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.tindivo.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(dishesText(section.items.count))
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
            .padding(TindivoTokens.Spacing.spaceInner)
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            .background(
                Color.tindivo.surfaceSunken, in: RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusCard)
            )
            .contentShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusCard))
        }
        .buttonStyle(.plain)
    }
}

#if DEBUG
#Preview("Chips e índice") {
    let names = ["Destacados", "Pollos", "Parrillas", "Bebidas", "Postres"]
    return VStack {
        SectionChipsBar(
            bar: .init(ids: names.indices.map { "c\($0)" }, names: names, selected: 1, showsIndex: true),
            onSelect: { _ in }, onShowIndex: {}
        )
        Spacer()
    }
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}

#Preview("Hoja del índice") {
    SectionIndexSheet(
        sections: ["Pollos", "Parrillas", "Bebidas"].enumerated().map {
            MenuCategory(id: "c\($0.offset)", name: $0.element, blurb: nil, items: [])
        },
        total: 12,
        onSelect: { _ in }
    )
    .onAppear { TindivoFonts.register() }
}
#endif
