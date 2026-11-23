import SwiftUI
import TindivoDesign

/// La fila de chips que sigue a la sección visible, con el botón del índice a la derecha desde 5 secciones. El chip
/// activo va en negrita y subrayado en el color del texto (no pastilla) y se centra solo. Cuántas secciones hay y desde
/// cuántas aparece cada cosa lo decide `BusinessScreenModel.sectionBar`; aquí solo se dibuja.
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
            if bar.showsIndex {
                Button(action: onShowIndex) {
                    HStack(spacing: 4) {
                        Image(tindivo: .index).accessibilityHidden(true)
                        Text(verbatim: "\(bar.names.count)").monospacedDigit()
                    }
                    .tindivoText(TindivoTokens.Typography.chip)
                    .foregroundStyle(Color.tindivo.ink)
                    .padding(.horizontal, TindivoTokens.Spacing.spaceInner)
                    .frame(minHeight: TindivoTokens.Spacing.touchTarget)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Ver las \(bar.names.count) secciones de la carta"))
                .accessibilityIdentifier("menu.indexButton")
            }
        }
        // `ScrollViewReader` acepta toda la altura que se le ofrece: dentro de un `safeAreaInset` tapaba la carta
        // entera. La barra mide lo que miden sus chips (y crece con la letra grande).
        .fixedSize(horizontal: false, vertical: true)
        .background(Color.tindivo.surface)
        .overlay(alignment: .bottom) { Color.tindivo.outlineVariant.frame(height: 1) }
    }

    private func chip(_ name: String, index: Int) -> some View {
        let isSelected = index == bar.selected
        return Button { onSelect(index) } label: {
            Text(name)
                .tindivoText(TindivoTokens.Typography.chip)
                .fontWeight(isSelected ? .bold : .regular)
                .foregroundStyle(Color.tindivo.ink)
                .lineLimit(1)
                .padding(.horizontal, TindivoTokens.Spacing.spaceInner)
                .frame(minHeight: TindivoTokens.Spacing.touchTarget)
                .overlay(alignment: .bottom) {
                    if isSelected { Color.tindivo.ink.frame(height: 2) }
                }
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
        Button { onSelect(index) } label: {
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
            .background(Color.tindivo.surfaceSunken, in: RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusCard))
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
