import SwiftUI
import TindivoDesign

/// Un grupo de opciones del plato: su cabecera con el avance y una fila por opción (radio o casilla).
struct DishGroupSection: View {
    let group: DishGroup
    let model: DishScreenModel
    /// El foco de VoiceOver: al tocar «Elige …» se lleva al título del grupo que falta.
    let focus: AccessibilityFocusState<String?>.Binding
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .body) private var markSize: CGFloat = 22

    var body: some View {
        let progress = model.selection.progress(of: group)
        VStack(alignment: .leading, spacing: 0) {
            header(progress)
            ForEach(group.options, id: \.id) { option in
                optionRow(option)
            }
        }
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        .padding(.top, TindivoTokens.Spacing.spaceGroup)
        // «Elige [grupo]» lo sacude (sin movimiento si la persona pidió «Reducir movimiento»).
        .tindivoShake(trigger: model.attention?.groupID == group.id ? model.attention?.serial ?? 0 : 0)
        .id(group.id)
    }

    private func header(_ progress: GroupProgress) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(group.name)
                    .tindivoText(TindivoTokens.Typography.titleSection)
                    .foregroundStyle(Color.tindivo.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityFocused(focus, equals: group.id)
                if let counter = model.counter(for: group) {
                    Text(counter.text)
                        .tindivoText(TindivoTokens.Typography.bodySecondary)
                        .monospacedDigit()
                        .fixedSize()
                        .foregroundStyle(Color.tindivo.inkSecondary)
                        .accessibilityLabel(counter.spoken)
                }
            }
            // «Obligatorio · elige 1» → «Listo ✓»; «Opcional · hasta 2».
            HStack(spacing: 4) {
                if progress.required && progress.done {
                    Image(tindivo: .done).accessibilityHidden(true)
                }
                Text(model.statusText(for: group))
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .fontWeight(progress.required ? .bold : .regular)
            }
            .foregroundStyle(statusColor(progress))
        }
        .padding(.bottom, 4)
    }

    private func statusColor(_ progress: GroupProgress) -> Color {
        guard progress.required else { return Color.tindivo.inkSecondary }
        return progress.done ? Color.tindivo.primaryText : Color.tindivo.error
    }

    private func price(of option: DishOption, enabled: Bool) -> some View {
        let text = model.selection.optionPrice(of: option, in: group).displayText
        return Text(text)
            .amountAccessibility(text)
            .tindivoText(TindivoTokens.Typography.bodySecondary)
            .monospacedDigit()
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(Color.tindivo.inkSecondary)
            .opacity(enabled ? 1 : MenuItemRowView.dimmedOpacity)
    }

    private func optionRow(_ option: DishOption) -> some View {
        let selected = model.selection.isSelected(option)
        let enabled = !model.selection.isDisabled(option, in: group)
        return Button {
            model.toggle(option, in: group)
        } label: {
            HStack(spacing: 8) {
                Image(tindivo: group.isSingle ? (selected ? .radioOn : .radioOff) : (selected ? .checkOn : .checkOff))
                    // La marca es decorativa: «seleccionado» lo dice el rasgo del botón, no el nombre del símbolo.
                    .accessibilityHidden(true)
                    .font(.system(size: markSize))
                    .foregroundStyle(selected ? Color.tindivo.primary : Color.tindivo.outline)
                    .opacity(enabled ? 1 : MenuItemRowView.dimmedOpacity)
                VStack(alignment: .leading, spacing: 0) {
                    Text(option.name)
                        .tindivoText(TindivoTokens.Typography.body)
                        .foregroundStyle(Color.tindivo.ink)
                        .opacity(enabled ? 1 : MenuItemRowView.dimmedOpacity)
                    if let description = option.description {
                        Text(description)
                            .tindivoText(TindivoTokens.Typography.bodySecondary)
                            .foregroundStyle(Color.tindivo.inkSecondary)
                    }
                    // Con letra grande el precio pasa debajo del nombre: el nombre no se parte a mitad de palabra.
                    if typeSize.isAccessibilitySize { price(of: option, enabled: enabled) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .layoutPriority(1)
                if !typeSize.isAccessibilitySize { price(of: option, enabled: enabled) }
            }
            .frame(minHeight: TindivoTokens.Spacing.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityIdentifier("dish.option")
    }
}
