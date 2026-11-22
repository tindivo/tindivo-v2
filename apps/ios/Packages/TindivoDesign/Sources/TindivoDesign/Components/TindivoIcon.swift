import SwiftUI

/// Los iconos de la app, por su significado y no por su dibujo. D-28 (qué familia de iconos usa iOS) sigue abierta:
/// hoy cada caso devuelve un SF Symbol, y cuando se decida el cambio es solo esta tabla. Ninguna vista nombra un
/// SF Symbol: pide `Image(tindivo: .back)`.
public enum TindivoIcon: Sendable, CaseIterable {
    case back
    case search
    case close
    /// El índice de secciones de la carta.
    case index
    case error
    case bag
    case plus
    case minus
    case radioOn
    case radioOff
    case checkOn
    case checkOff

    var systemName: String {
        switch self {
        case .back: "chevron.left"
        case .search: "magnifyingglass"
        case .close: "xmark"
        case .index: "square.grid.2x2"
        case .error: "exclamationmark.triangle"
        case .bag: "bag"
        case .plus: "plus"
        case .minus: "minus"
        case .radioOn: "largecircle.fill.circle"
        case .radioOff: "circle"
        case .checkOn: "checkmark.square.fill"
        case .checkOff: "square"
        }
    }
}

extension Image {
    /// El icono de la app; decorativo hasta que quien lo usa le ponga etiqueta.
    public init(tindivo icon: TindivoIcon) {
        self.init(systemName: icon.systemName)
    }
}

#Preview("Iconos") {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: TindivoTokens.Spacing.spaceGroup) {
        ForEach(TindivoIcon.allCases, id: \.self) { icon in
            Image(tindivo: icon)
                .font(.title2)
                .foregroundStyle(Color.tindivo.ink)
        }
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
}
