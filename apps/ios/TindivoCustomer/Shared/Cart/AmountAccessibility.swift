import SwiftUI

extension View {
    /// Si el texto lleva un importe que no se pudo mostrar («—»), VoiceOver lee «Precio no disponible».
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
    /// Aviso a nivel de bolsa sobre importes que no se pueden mostrar. Con una línea rota, el de CUS-CRT-005
    /// (`bolsa.importe_no_mostrable`, decisión de Jesús del 2026-11-26), además del aviso de esa línea. Sin líneas rotas
    /// pero con el subtotal en «—», la suma se sale del tope de un importe: reintentar no lo arregla; bajar cantidades, sí.
    var amountNotice: String? {
        if lines.contains(where: { $0.total == invalidAmountText }) {
            return String(localized: "No podemos mostrar un precio. Intenta de nuevo en un rato.")
        }
        guard subtotal == invalidAmountText else { return nil }
        return String(localized: "No pudimos calcular el subtotal de tu bolsa. Revisa las cantidades.")
    }
}
