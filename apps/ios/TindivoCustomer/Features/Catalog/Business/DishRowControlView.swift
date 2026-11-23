import SwiftUI
import TindivoDesign

/// Lo que una tarjeta de plato puede hacer ahora: el control que se ve y qué pasa con cada toque (CUS-CAT-029).
struct DishRowAction {
    let control: DishRowControl
    let onAdd: () -> Void
    let onDecrease: () -> Void
    let onChoose: () -> Void
}

/// El control de una tarjeta de plato, FUERA de la foto: «+», «− 1 +», «Elegir», o «En tu bolsa: N» con «Editar
/// selección». Va fuera del botón que abre la ficha, para que cada toque sea de una sola cosa.
struct DishRowControlView: View {
    let action: DishRowAction
    let itemName: String

    var body: some View {
        switch action.control {
        case .add:
            TindivoRoundButton(.plus, label: String(localized: "Agregar \(itemName)"), action: action.onAdd)
                .accessibilityIdentifier("menu.add")
        case let .stepper(quantity, canIncrease):
            TindivoStepper(
                quantity: quantity, canDecrease: true, canIncrease: canIncrease,
                decreaseLabel: String(localized: "Una menos"), increaseLabel: String(localized: "Una más"),
                onDecrease: action.onDecrease, onIncrease: action.onAdd
            )
            .accessibilityIdentifier("menu.stepper")
        case .choose:
            TindivoCompactButton(String(localized: "Elegir"), action: action.onChoose)
                .accessibilityLabel(Text("Elegir \(itemName)"))
                .accessibilityIdentifier("menu.choose")
        case let .inBag(quantity):
            VStack(alignment: .trailing, spacing: 4) {
                Text("En tu bolsa: \(quantity)")
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                TindivoCompactButton(String(localized: "Editar selección"), action: action.onChoose)
                    .accessibilityLabel(Text("Editar selección de \(itemName)"))
                    .accessibilityIdentifier("menu.edit")
            }
        }
    }
}

#if DEBUG
#Preview("Controles de la tarjeta") {
    VStack(alignment: .trailing, spacing: TindivoTokens.Spacing.spaceInner) {
        ForEach(
            [DishRowControl.add, .stepper(quantity: 2, canIncrease: true), .choose, .inBag(quantity: 2)], id: \.self
        ) { control in
            DishRowControlView(
                action: DishRowAction(control: control, onAdd: {}, onDecrease: {}, onChoose: {}), itemName: "1/4 de pollo"
            )
        }
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
#endif
