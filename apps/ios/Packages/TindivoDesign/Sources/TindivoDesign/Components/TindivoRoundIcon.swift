import SwiftUI

/// Un icono de marca en un círculo `primaryContainer` (`#FFF7ED`): la cabecera de la bolsa, las filas del resumen, el
/// «+» de «Agregar más». Decorativo: lo que dice va en el texto de al lado.
public struct TindivoRoundIcon: View {
    private let icon: TindivoIcon
    private let size: CGFloat

    public init(_ icon: TindivoIcon, size: CGFloat = 44) {
        self.icon = icon
        self.size = size
    }

    public var body: some View {
        Image(tindivo: icon)
            .font(.system(size: size * 0.5, weight: .semibold))
            .foregroundStyle(Color.tindivo.primaryText)
            .frame(width: size, height: size)
            .background(Color.tindivo.primaryContainer, in: Circle())
            .accessibilityHidden(true)
    }
}

#Preview("Icono redondo") {
    HStack {
        TindivoRoundIcon(.bag)
        TindivoRoundIcon(.plus, size: 40)
        TindivoRoundIcon(.receipt)
        TindivoRoundIcon(.courier)
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
}
