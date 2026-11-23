import SwiftUI

extension View {
    /// «¿Empezar una bolsa nueva?»: la pregunta cuando se agrega un plato con la bolsa de otro restaurante. Es la misma
    /// desde la carta (el «+») y desde la ficha del plato: un solo texto y un solo sitio donde cambiarlo.
    func replaceBagAlert(
        _ replacement: DishScreenModel.Replacement?, onKeep: @escaping () -> Void, onReplace: @escaping () -> Void
    ) -> some View {
        alert(
            Text("¿Empezar una bolsa nueva?"),
            isPresented: Binding(get: { replacement != nil }, set: { _ in }),
            presenting: replacement
        ) { _ in
            Button("Mantener", role: .cancel, action: onKeep)
            Button("Vaciar y empezar", action: onReplace)
        } message: { names in
            Text(
                "Tu bolsa tiene productos de \(names.current). Solo puedes pedir de un restaurante a la vez. Si continúas, vaciaremos tu bolsa para empezar en \(names.new)."
            )
        }
    }
}
