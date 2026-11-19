// GENERADO por packages/design-tokens/src/cli.ts desde packages/design-tokens/tokens.json.
// No se edita a mano: se cambia tokens.json y se corre `pnpm tokens:build`.

import SwiftUI

/// Un estilo de texto: la familia (Geist) la pone quien lo usa.
public struct TypeToken: Sendable {
    public let size: CGFloat
    public let line: CGFloat
    public let weight: Font.Weight
    public let tracking: CGFloat
}

extension Color {
    fileprivate init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

public enum TindivoTokens {
    public static let fontFamily = "Geist"

    public enum Colors {
        public static let brand = Color(hex: 0xF97316)
        public static let brandDark = Color(hex: 0xC2410C)
        public static let brandDeep = Color(hex: 0x9A3412)
        public static let brandSoft = Color(hex: 0xFFF7ED)
        public static let brandInverse = Color(hex: 0xFDBA74)
        public static let ink = Color(hex: 0x1A1614)
        public static let inkMuted = Color(hex: 0x57534E)
        public static let inkSubtle = Color(hex: 0xA8A29E)
        public static let surface = Color(hex: 0xFAF6F1)
        public static let surfaceLow = Color(hex: 0xF0EBE3)
        public static let surfaceMid = Color(hex: 0xF5F1EB)
        public static let card = Color(hex: 0xFFFFFF)
        public static let border = Color(hex: 0xEAE7E2)
        public static let success = Color(hex: 0x15803D)
        public static let successSoft = Color(hex: 0xDCFCE7)
        public static let successDeep = Color(hex: 0x166534)
        public static let warning = Color(hex: 0xB45309)
        public static let warningSoft = Color(hex: 0xFEF3C7)
        public static let warningDeep = Color(hex: 0x92400E)
        public static let danger = Color(hex: 0xDC2626)
        public static let dangerSoft = Color(hex: 0xFEE2E2)
        public static let dangerDeep = Color(hex: 0x991B1B)
    }

    public enum Radius {
        public static let extraSmall: CGFloat = 8
        public static let small: CGFloat = 12
        public static let medium: CGFloat = 16
        public static let large: CGFloat = 20
        public static let extraLarge: CGFloat = 28
    }

    public enum Spacing {
        public static let hairline: CGFloat = 4
        public static let tight: CGFloat = 8
        public static let item: CGFloat = 12
        public static let screen: CGFloat = 16
        public static let section: CGFloat = 24
        public static let hero: CGFloat = 32
        public static let touchTarget: CGFloat = 48
        public static let primaryButtonHeight: CGFloat = 52
    }

    public enum Typography {
        public static let displayLarge = TypeToken(size: 36, line: 42, weight: .bold, tracking: -0.5)
        public static let displayMedium = TypeToken(size: 32, line: 38, weight: .bold, tracking: -0.4)
        public static let displaySmall = TypeToken(size: 28, line: 34, weight: .bold, tracking: -0.3)
        public static let headlineLarge = TypeToken(size: 28, line: 34, weight: .bold, tracking: -0.3)
        public static let headlineMedium = TypeToken(size: 24, line: 30, weight: .bold, tracking: -0.2)
        public static let headlineSmall = TypeToken(size: 22, line: 28, weight: .bold, tracking: -0.2)
        public static let titleLarge = TypeToken(size: 20, line: 26, weight: .semibold, tracking: -0.1)
        public static let titleMedium = TypeToken(size: 17, line: 24, weight: .semibold, tracking: 0)
        public static let titleSmall = TypeToken(size: 15, line: 20, weight: .semibold, tracking: 0)
        public static let bodyLarge = TypeToken(size: 16, line: 24, weight: .regular, tracking: 0)
        public static let bodyMedium = TypeToken(size: 14, line: 20, weight: .regular, tracking: 0)
        public static let bodySmall = TypeToken(size: 12, line: 16, weight: .regular, tracking: 0)
        public static let labelLarge = TypeToken(size: 15, line: 20, weight: .bold, tracking: 0)
        public static let labelMedium = TypeToken(size: 12, line: 16, weight: .semibold, tracking: 0)
        public static let labelSmall = TypeToken(size: 11, line: 16, weight: .medium, tracking: 0.1)
    }
}
