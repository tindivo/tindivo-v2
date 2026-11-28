import SwiftUI

/// Los iconos de la app, por su significado y no por su dibujo. D-28 (qué familia de iconos usa iOS) sigue abierta:
/// hoy cada caso devuelve un SF Symbol, y cuando se decida el cambio es solo esta tabla. Ninguna vista nombra un
/// SF Symbol: pide `Image(tindivo: .back)`.
public enum TindivoIcon: Sendable, CaseIterable {
    case back
    /// El «›» de una fila que lleva a otra pantalla u hoja.
    case forward
    case search
    case close
    /// El índice de secciones de la carta.
    case index
    case error
    case bag
    case plus
    /// Quitar una línea (el «−» de una cantidad de 1).
    case trash
    /// Un paso resuelto («Listo»).
    case done
    case minus
    case radioOn
    case radioOff
    case checkOn
    case checkOff
    /// Las cuatro pestañas de la barra de abajo.
    case home
    case courier
    /// «Pedidos» en la barra de pestañas y la fila del subtotal en la bolsa.
    case receipt
    case account
    /// La flecha «→» del banner de Entregas.
    case arrowForward

    var systemName: String {
        switch self {
        case .back: "chevron.left"
        case .forward: "chevron.right"
        case .search: "magnifyingglass"
        case .close: "xmark"
        case .index: "square.grid.2x2"
        case .error: "exclamationmark.triangle"
        case .bag: "bag"
        case .plus: "plus"
        case .trash: "trash"
        case .done: "checkmark.circle.fill"
        case .minus: "minus"
        case .radioOn: "largecircle.fill.circle"
        case .radioOff: "circle"
        case .checkOn: "checkmark.square.fill"
        case .checkOff: "square"
        case .home: "house.fill"
        case .courier: "box.truck.fill"
        case .receipt: "list.clipboard.fill"
        case .account: "person.fill"
        case .arrowForward: "arrow.right"
        }
    }
}

extension Image {
    /// El icono de la app. Un SF Symbol se lee en VoiceOver con el nombre del dibujo («plus», «xmark»): quien lo usa lo
    /// oculta con `.accessibilityHidden(true)` cuando es decorativo, o deja que la etiqueta de su botón lo tape.
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
