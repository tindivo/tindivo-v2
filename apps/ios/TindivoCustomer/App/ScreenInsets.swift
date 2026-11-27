import SwiftUI
import UIKit

/// Lo que SwiftUI no da a una vista que se dibuja bajo la barra de estado: su alto, para que la portada de la carta
/// llegue hasta el borde de la pantalla.
@MainActor
enum ScreenInsets {
    /// El alto de la barra de estado (el margen superior de la ventana activa); 0 si aún no hay ventana.
    static var top: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .safeAreaInsets.top ?? 0
    }
}

/// Con la barra de navegación oculta (la carta dibuja la suya), UIKit apaga el gesto de volver deslizando desde el
/// borde. Este controlador, puesto de fondo en UNA pantalla, lo devuelve solo mientras ella está a la vista: toma el
/// delegado del gesto al aparecer y devuelve el que había al irse. `enabled` en `false` (por ejemplo, mientras se busca)
/// lo apaga, y nunca arranca durante una transición. Envuelve UIKit en un representable, sin tocar las demás pilas (SW-12).
struct InteractivePopGesture: UIViewControllerRepresentable {
    let enabled: Bool

    func makeUIViewController(context: Context) -> Controller { Controller() }

    func updateUIViewController(_ controller: Controller, context: Context) {
        controller.enabled = enabled
    }

    final class Controller: UIViewController, UIGestureRecognizerDelegate {
        var enabled = true
        private weak var previousDelegate: UIGestureRecognizerDelegate?
        private weak var gesture: UIGestureRecognizer?

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard let pop = navigationController?.interactivePopGestureRecognizer, pop.delegate !== self else { return }
            previousDelegate = pop.delegate
            gesture = pop
            pop.delegate = self
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            if let gesture, gesture.delegate === self { gesture.delegate = previousDelegate }
            gesture = nil
        }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard enabled, let navigation = navigationController else { return false }
            return navigation.viewControllers.count > 1 && navigation.transitionCoordinator == nil
        }
    }
}
