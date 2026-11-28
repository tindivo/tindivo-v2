import SwiftUI
import TindivoDesign

/// Un grupo de opciones del plato en su tarjeta blanca (`DishSheetGroups.kt`): nombre, ayuda («Elige 1», «Hasta 2») y una
/// píldora («Obligatorio», «Listo», «Opcional»), y debajo una fila con borde por opción (radio o casilla).
struct DishGroupSection: View {
    let group: DishGroup
    let model: DishScreenModel
    /// El foco de VoiceOver: al tocar «Elige …» se lleva al título del grupo que falta.
    let focus: AccessibilityFocusState<String?>.Binding
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let progress = model.selection.progress(of: group)
        let highlighted = model.isHighlighted(group)
        let inset = ScreenInsets.top + DishTopBar.height + 8
        VStack(spacing: 0) {
            // Marcador de alto cero, `inset` más arriba que el grupo: `scrollTo(anchor: .top)` lo deja bajo la barra.
            Color.clear.frame(height: inset).id(Self.anchorID(group.id))
                .accessibilityHidden(true)
            TindivoCard {
                VStack(alignment: .leading, spacing: 8) {
                    header(progress)
                    if highlighted {
                        // CA-CAT-P7: mientras el grupo siga sin resolver, borde de error y «Falta elegir aquí».
                        Text("Falta elegir aquí")
                            .tindivoText(TypeToken.bodyMedium)
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.tindivo.error)
                            .padding(.horizontal, 4)
                            .accessibilityIdentifier("dish.group.missing")
                    }
                    ForEach(group.options, id: \.id) { option in
                        optionRow(option)
                    }
                }
                .padding(.init(top: 16, leading: 12, bottom: 12, trailing: 12))
            }
            .overlay {
                if highlighted {
                    RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusCard, style: .continuous)
                        .strokeBorder(Color.tindivo.error, lineWidth: 2)
                        .allowsHitTesting(false)
                }
            }
        }
        // El marcador queda `inset` sobre el grupo sin ocupar sitio: el relleno negativo se come su alto.
        .padding(.top, -inset)
    }

    /// El marcador al que `DishView` lleva la vista para mostrar el grupo `id` bajo la barra de arriba.
    static func anchorID(_ id: String) -> String { "\(id).anchor" }

    private func header(_ progress: GroupProgress) -> some View {
        let title = VStack(alignment: .leading, spacing: 0) {
            Text(group.name)
                .tindivoText(TindivoTokens.Typography.titleSection)
                .foregroundStyle(Color.tindivo.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused(focus, equals: group.id)
            if let hint = model.hint(for: group) {
                Text(hint)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                    // La píldora ya dice lo mismo para VoiceOver («Obligatorio · elige 1»).
                    .accessibilityHidden(true)
            }
        }
        return Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    title
                    pill(progress)
                }
            } else {
                HStack(alignment: .top, spacing: 8) {
                    title.frame(maxWidth: .infinity, alignment: .leading)
                    pill(progress)
                }
            }
        }
        .padding(.init(top: 0, leading: 4, bottom: 2, trailing: 4))
    }

    /// «Obligatorio» en ámbar mientras falta, «Listo» en verde con el visto, «Opcional» en gris.
    private func pill(_ progress: GroupProgress) -> some View {
        let text: String
        let tone: TindivoStatusPill.Tone
        if progress.required && progress.done {
            (text, tone) = (String(localized: "Listo"), .success)
        } else if progress.required {
            (text, tone) = (String(localized: "Obligatorio"), .warning)
        } else {
            (text, tone) = (String(localized: "Opcional"), .neutral)
        }
        return TindivoStatusPill(text, tone: tone, icon: progress.required && progress.done ? .done : nil)
            .fixedSize(horizontal: false, vertical: true)
            // Lo que dice por voz es el estado completo, con lo que hay que elegir y cuánto va.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(model.statusText(for: group))
            .accessibilityValue(model.spokenCount(for: group) ?? "")
    }

    private func price(of option: DishOption) -> some View {
        let text = model.selection.optionPrice(of: option, in: group).displayText
        return Text(text.replacingOccurrences(of: "S/ ", with: "S/\u{00A0}"))
            .amountAccessibility(text)
            .tindivoText(TypeToken.labelLarge)
            .fontWeight(.semibold)
            .monospacedDigit()
            .fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(Color.tindivo.inkSecondary)
    }

    private func optionRow(_ option: DishOption) -> some View {
        TindivoSelectableRow(
            option.name, subtitle: option.description, selected: model.selection.isSelected(option),
            multiple: !group.isSingle, enabled: !model.selection.isDisabled(option, in: group),
            action: { model.toggle(option, in: group) },
            trailing: { price(of: option) }
        )
        .accessibilityIdentifier("dish.option")
    }
}
