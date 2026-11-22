import SwiftUI
import TindivoDesign

/// Un grupo de opciones del plato: su cabecera con el avance y una fila por opción (radio o casilla).
struct DishGroupSection: View {
    let group: DishGroup
    let model: DishScreenModel

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
    }

    private func header(_ progress: GroupProgress) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(group.name)
                    .tindivoText(TindivoTokens.Typography.titleSection)
                    .foregroundStyle(Color.tindivo.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
                Text(counter(progress))
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .monospacedDigit()
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
            HStack(spacing: 8) {
                if progress.required {
                    Text(progress.done ? "Listo" : "Obligatorio")
                        .tindivoText(TindivoTokens.Typography.bodySecondary)
                        .fontWeight(.bold)
                        .foregroundStyle(progress.done ? Color.tindivo.primaryText : Color.tindivo.error)
                }
                if let hint = hint(progress) {
                    Text(hint)
                        .tindivoText(TindivoTokens.Typography.bodySecondary)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                }
            }
        }
        .padding(.bottom, 4)
    }

    private func counter(_ progress: GroupProgress) -> String {
        progress.max.map { "\(progress.count)/\($0)" } ?? "\(progress.count)/∞"
    }

    private func hint(_ progress: GroupProgress) -> String? {
        if progress.single { return String(localized: "Elige una opción") }
        return progress.max.map { String(localized: "Hasta \($0)") }
    }

    private func optionRow(_ option: DishOption) -> some View {
        let selected = model.selection.isSelected(option)
        let enabled = !model.selection.isDisabled(option, in: group)
        return Button { model.toggle(option, in: group) } label: {
            HStack(spacing: 8) {
                Image(tindivo: group.isSingle ? (selected ? .radioOn : .radioOff) : (selected ? .checkOn : .checkOff))
                    .font(.system(size: 22))
                    .foregroundStyle(selected ? Color.tindivo.primary : Color.tindivo.outline)
                VStack(alignment: .leading, spacing: 0) {
                    Text(option.name)
                        .tindivoText(TindivoTokens.Typography.body)
                        .foregroundStyle(Color.tindivo.ink)
                    if let description = option.description {
                        Text(description)
                            .tindivoText(TindivoTokens.Typography.bodySecondary)
                            .foregroundStyle(Color.tindivo.inkSecondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(model.selection.optionPrice(of: option, in: group).displayText)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .monospacedDigit()
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
            .frame(minHeight: TindivoTokens.Spacing.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.5)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityIdentifier("dish.option")
    }
}
