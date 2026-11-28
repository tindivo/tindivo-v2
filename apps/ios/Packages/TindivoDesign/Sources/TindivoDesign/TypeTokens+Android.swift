import SwiftUI

/// Estilos de texto que Android v3.1 usa y `packages/design-tokens/tokens.json` aún no tiene. Son locales a iOS a
/// propósito: el JSON es de todas las apps y no se toca desde esta (el cambio de los tokens es una decisión aparte).
/// Cada uno dice su equivalente en la escala de Material de Android (`TindivoType.kt`).
extension TypeToken {
    /// `headlineSmall`: el saludo de Inicio.
    public static let greeting = TypeToken(size: 22, line: 28, weight: .bold)
    /// `titleMedium`: el nombre de un negocio o de un plato, el importe de una tarjeta.
    public static let titleCard = TypeToken(size: 16, line: 22, weight: .bold)
    /// `bodyMedium`: texto de apoyo.
    public static let bodyMedium = TypeToken(size: 14, line: 20, weight: .regular)
    /// `bodyLarge` en su peso normal: el nombre y el precio de una línea de la bolsa, «Agregar más». Se pone en negrita
    /// donde Android lo hace.
    public static let bodyLarge = TypeToken(size: 16, line: 24, weight: .regular)
    /// `labelLarge`: botones secundarios y la pastilla del banner.
    public static let labelLarge = TypeToken(size: 15, line: 20, weight: .bold)
    /// `labelMedium`: chips, plazos, el texto de la barra de pestañas.
    public static let labelMedium = TypeToken(size: 12, line: 16, weight: .semibold)
    /// `labelSmall`: metadatos («Entregar en»).
    public static let labelSmall = TypeToken(size: 11, line: 16, weight: .medium)
}
