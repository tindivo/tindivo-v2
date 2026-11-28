import SwiftUI

extension Color {
    /// Un color opaco a partir de su valor ARGB (`0xFFRRGGBB`), para lo que el servidor manda como dato (el acento de
    /// cada negocio). Los colores de la app salen de `Color.tindivo`, no de aquí.
    public init(argb: UInt32) {
        self.init(
            .sRGB,
            red: Double((argb >> 16) & 0xFF) / 255,
            green: Double((argb >> 8) & 0xFF) / 255,
            blue: Double(argb & 0xFF) / 255,
            opacity: Double((argb >> 24) & 0xFF) / 255
        )
    }
}
