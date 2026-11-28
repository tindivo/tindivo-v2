import SwiftUI

/// Una opción que se elige (una de varias, o varias): alto mínimo 56, radio 16 y borde de 1 en `outlineVariant`.
/// Elegida lleva borde de 1,5 en `primaryText` y fondo `primaryContainer`, y el nombre en semibold. A la izquierda va el
/// control de 40 (círculo o casilla) y a la derecha, lo que ponga quien la usa (el precio extra). `subtitle` es la línea
/// de apoyo bajo el nombre; `enabled: false` la apaga a medias y la vuelve inerte.
/// Con letra de accesibilidad, lo de la derecha pasa debajo del nombre, para que este no se parta a media palabra.
/// Para VoiceOver es un botón con el rasgo «seleccionado».
public struct TindivoSelectableRow<Trailing: View>: View {
    private let title: String
    private let subtitle: String?
    private let selected: Bool
    private let multiple: Bool
    private let enabled: Bool
    private let trailing: Trailing
    private let action: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .body) private var markSize: CGFloat = 22

    public init(
        _ title: String, subtitle: String? = nil, selected: Bool, multiple: Bool = false, enabled: Bool = true,
        action: @escaping () -> Void, @ViewBuilder trailing: () -> Trailing
    ) {
        self.title = title
        self.subtitle = subtitle
        self.selected = selected
        self.multiple = multiple
        self.enabled = enabled
        self.trailing = trailing()
        self.action = action
    }

    private var dimmed: Double { enabled ? 1 : 0.5 }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField, style: .continuous)
        Button(action: action) {
            HStack(spacing: 0) {
                Image(tindivo: control)
                    .font(.system(size: markSize))
                    .foregroundStyle(selected ? Color.tindivo.primaryText : Color.tindivo.outline)
                    .frame(width: max(40, markSize + 18), height: max(40, markSize + 18))
                    .opacity(dimmed)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: title)
                        .tindivoText(TindivoTokens.Typography.body)
                        .fontWeight(selected ? .semibold : .regular)
                        .foregroundStyle(Color.tindivo.ink)
                        .opacity(dimmed)
                    if let subtitle {
                        Text(verbatim: subtitle)
                            .tindivoText(TindivoTokens.Typography.bodySecondary)
                            .foregroundStyle(Color.tindivo.inkSecondary)
                    }
                    if typeSize.isAccessibilitySize { trailing.opacity(dimmed) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .layoutPriority(1)
                if !typeSize.isAccessibilitySize { trailing.fixedSize().opacity(dimmed).padding(.trailing, 8) }
            }
            .padding(4)
            .frame(minHeight: 56)
            .background(selected ? Color.tindivo.primaryContainer : Color.tindivo.surface, in: shape)
            .overlay(
                shape.strokeBorder(
                    selected ? Color.tindivo.primaryText : Color.tindivo.outlineVariant, lineWidth: selected ? 1.5 : 1)
            )
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
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
    public init(
        _ title: String, subtitle: String? = nil, selected: Bool, multiple: Bool = false, enabled: Bool = true,
        action: @escaping () -> Void
    ) {
        self.init(
            title, subtitle: subtitle, selected: selected, multiple: multiple, enabled: enabled, action: action,
            trailing: { EmptyView() })
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
