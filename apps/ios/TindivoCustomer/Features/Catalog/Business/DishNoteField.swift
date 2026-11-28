import SwiftUI
import TindivoDesign

/// La nota en su tarjeta: un campo con borde que lleva su etiqueta dentro (flota al escribir) y, debajo, el contador.
struct DishNoteField: View {
    let model: DishScreenModel
    @FocusState private var noteFocused: Bool

    var body: some View {
        let text = Binding(get: { model.selection.note }, set: { model.setNote($0) })
        let floating = noteFocused || !model.selection.note.isEmpty
        return TindivoCard(padding: TindivoTokens.Spacing.spaceScreen) {
            VStack(alignment: .leading, spacing: 4) {
                VStack(alignment: .leading, spacing: 2) {
                    if floating {
                        Text("Nota (opcional)")
                            .tindivoText(TindivoTokens.Typography.bodySecondary)
                            .foregroundStyle(Color.tindivo.inkSecondary)
                            .accessibilityHidden(true)
                    }
                    // En reposo la etiqueta ocupa el lugar del texto; es un `Text` (y no el `prompt`) y comparte el
                    // espacio con el campo, para que con letra grande pase a otra línea en vez de cortarse.
                    ZStack(alignment: .topLeading) {
                        TextField(
                            "", text: text,
                            prompt: Text(floating ? "Ej. sin cebolla, bien cocido, tocar timbre 2 veces…" : " ")
                                .foregroundColor(Color.tindivo.inkSecondary),
                            axis: .vertical
                        )
                        .focused($noteFocused)
                        .lineLimit(2...4)
                        .tindivoText(TypeToken.bodyLarge)
                        .foregroundStyle(Color.tindivo.ink)
                        .accessibilityLabel(Text("Nota (opcional)"))
                        .accessibilityIdentifier("dish.note")
                        if !floating {
                            Text("Nota (opcional)")
                                .tindivoText(TypeToken.bodyLarge)
                                .foregroundStyle(Color.tindivo.inkSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                                .allowsHitTesting(false)
                                .accessibilityHidden(true)
                        }
                    }
                }
                .padding(.init(top: 12, leading: 16, bottom: 12, trailing: 16))
                .frame(maxWidth: .infinity, minHeight: 80, alignment: .topLeading)
                .overlay {
                    RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField, style: .continuous)
                        .strokeBorder(
                            noteFocused ? Color.tindivo.primaryText : Color.tindivo.outline,
                            lineWidth: noteFocused ? 2 : 1)
                }
                .contentShape(Rectangle())
                .onTapGesture { noteFocused = true }
                Text(model.noteCounter.text)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .monospacedDigit()
                    .foregroundStyle(Color.tindivo.inkSecondary)
                    .padding(.horizontal, 16)
                    .accessibilityLabel(model.noteCounter.spoken)
            }
        }
    }
}
