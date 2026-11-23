import Foundation
import TindivoAPI

/// El texto que ve la persona cuando una carga falla (`error_network` y `error_generic` de Android). La pantalla
/// decide por el caso del error, nunca por el texto de `detail` (API-5).
enum ErrorText {
    static func message(for error: AppError) -> String {
        switch error {
        case .network: String(localized: "Sin conexión. Revisa tu internet e inténtalo de nuevo.")
        default: String(localized: "Algo salió mal. Inténtalo de nuevo.")
        }
    }
}
