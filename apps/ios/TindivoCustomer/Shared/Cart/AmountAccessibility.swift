import SwiftUI

extension View {
    /// Si el texto lleva un importe que no se pudo mostrar («—»), VoiceOver lee «Importe no disponible».
    @ViewBuilder
    func amountAccessibility(_ text: String) -> some View {
        if text.contains(invalidAmountText) {
            accessibilityLabel(Text(verbatim: spokenAmountText(text)))
        } else {
            self
        }
    }
}

extension CartScreenModel.Filled {
    /// Aviso a nivel de bolsa: el subtotal no se puede mostrar aunque cada línea sí, porque la suma se sale del tope de un
    /// importe. Reintentar no lo arregla; bajar cantidades, sí. Con una línea rota ya avisa esa línea.
    var subtotalNotice: String? {
        guard subtotal == invalidAmountText, lines.allSatisfy({ $0.total != invalidAmountText }) else { return nil }
        return String(localized: "No pudimos calcular el subtotal de tu bolsa. Revisa las cantidades.")
    }
}
