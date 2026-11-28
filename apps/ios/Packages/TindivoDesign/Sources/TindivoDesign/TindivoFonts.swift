import CoreText
import Foundation
import SwiftUI

/// Geist, la letra de la marca: el mismo TTF variable recortado (400–700) que usa Android
/// (`apps/android/core/designsystem/fonts/README.md`, SHA-256 4eb94258…). Licencia OFL 1.1 en `Resources/OFL.txt`.
public enum TindivoFonts {
    /// Registra Geist en el proceso. Se llama una vez desde la raíz de la app; repetirla no hace daño.
    /// Devuelve `false` si el archivo no está en el paquete o CoreText lo rechaza; la UI cae entonces en la del sistema.
    @discardableResult
    public static func register() -> Bool {
        guard let url = Bundle.module.url(forResource: "Geist", withExtension: "ttf") else { return false }
        var error: Unmanaged<CFError>?
        if CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) { return true }
        // Ya registrada en este proceso: es el caso normal de una segunda llamada.
        return isRegistered
    }

    /// Si el sistema ya resuelve la familia (lo mira CoreText, sin depender de UIKit).
    public static var isRegistered: Bool {
        let font = CTFontCreateWithName(TindivoTokens.fontFamily as CFString, 12, nil)
        return (CTFontCopyFamilyName(font) as String) == TindivoTokens.fontFamily
    }
}

extension Font {
    /// Un estilo del canon con Geist, que crece con el tamaño de letra del sistema (CLI-13: Dynamic Type) tomando como
    /// referencia el estilo del sistema más parecido. El interlineado lo aplica `View.tindivoText(_:)`.
    public static func tindivo(_ token: TypeToken) -> Font {
        .custom(TindivoTokens.fontFamily, size: token.size, relativeTo: token.systemStyle).weight(token.weight)
    }
}

extension TypeToken {
    /// El estilo del sistema con el que escala cada token del canon.
    var systemStyle: Font.TextStyle {
        switch size {
        case 24...: .title
        case 17..<24: .headline
        case 15..<17: .body
        case 14..<15: .subheadline
        default: .footnote
        }
    }
}
