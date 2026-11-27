import SwiftUI

/// Una opción que se elige (una de varias, o varias): alto mínimo 56, radio 16 y borde de 1 en `outlineVariant`.
/// Elegida lleva borde de 1,5 en `primary` y fondo `primaryContainer`, y el nombre en semibold. A la izquierda va el
/// control de 40 (círculo o casilla) y a la derecha, lo que ponga quien la usa (el precio extra).
/// Para VoiceOver es un botón con el rasgo «seleccionado».
public struct TindivoSelectableRow<Trailing: View>: View {
    private let title: String
    private let selected: Bool
    private let multiple: Bool
    private let trailing: Trailing
    private let action: () -> Void

    public init(
        _ title: String, selected: Bool, multiple: Bool = false, action: @escaping () -> Void,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.title = title
        self.selected = selected
        self.multiple = multiple
        self.trailing = trailing()
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 0) {
                Image(tindivo: control)
                    .font(.system(size: 22))
                    .foregroundStyle(selected ? Color.tindivo.primaryText : Color.tindivo.outline)
                    .frame(width: 40, height: 40)
                    .accessibilityHidden(true)
                Text(verbatim: title)
                    .tindivoText(TindivoTokens.Typography.body)
                    .fontWeight(selected ? .semibold : .regular)
                    .foregroundStyle(Color.tindivo.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                trailing
                    .padding(.trailing, 8)
            }
            .padding(4)
            .frame(minHeight: 56)
            .background(
                selected ? Color.tindivo.primaryContainer : Color.tindivo.surface,
                in: RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField, style: .continuous)
                    .strokeBorder(
                        selected ? Color.tindivo.primaryText : Color.tindivo.outlineVariant,
                        lineWidth: selected ? 1.5 : 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var control: TindivoIcon {
        switch (multiple, selected) {
        case (false, true): .radioOn
        case (false, false): .radioOff
        case (true, true): .checkOn
        case (true, false): .checkOff
        }
    }
}

extension TindivoSelectableRow where Trailing == EmptyView {
    public init(_ title: String, selected: Bool, multiple: Bool = false, action: @escaping () -> Void) {
        self.init(title, selected: selected, multiple: multiple, action: action, trailing: { EmptyView() })
    }
}

#Preview("Opciones") {
    VStack(spacing: 8) {
        TindivoSelectableRow(
            "Pecho", selected: true, action: {},
            trailing: { Text("+ S/ 2.00").tindivoText(TindivoTokens.Typography.bodySecondary) })
        TindivoSelectableRow("Pierna", selected: false, action: {})
        TindivoSelectableRow("Ensalada", selected: true, multiple: true, action: {})
        TindivoSelectableRow("Papas", selected: false, multiple: true, action: {})
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
