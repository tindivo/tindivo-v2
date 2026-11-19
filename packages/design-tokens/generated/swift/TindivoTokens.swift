// GENERADO por packages/design-tokens/src/cli.ts desde packages/design-tokens/tokens.json
// (que refleja Docs/negocio/sistema-de-diseno.md). No se edita a mano: se cambia el JSON y se corre `pnpm tokens:build`.

import SwiftUI

/// Un estilo de texto: la familia (Geist) la pone quien lo usa. `line` es nil si el canon no la fija.
public struct TypeToken: Sendable {
    public let size: CGFloat
    public let line: CGFloat?
    public let weight: Font.Weight
}

/// Una capa de sombra; una elevación es un arreglo de capas.
public struct ShadowLayer: Sendable {
    public let x: CGFloat
    public let y: CGFloat
    public let blur: CGFloat
    public let color: Color
}

extension Color {
    fileprivate init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

public enum TindivoTokens {
    public static let fontFamily = "Geist"

    public enum Colors {
        public static let primary = Color(hex: 0xEE6417)
        public static let primaryPressed = Color(hex: 0xCF4A0C)
        public static let onPrimary = Color(hex: 0xFFFFFF)
        public static let primaryText = Color(hex: 0xC2410C)
        public static let brand = Color(hex: 0xFA7020)
        public static let primaryContainer = Color(hex: 0xFFF7ED)
        public static let onPrimaryContainer = Color(hex: 0x9A3412)
        public static let secondary = Color(hex: 0x2E3236)
        public static let onSecondary = Color(hex: 0xFFFFFF)
        public static let ink = Color(hex: 0x2E3236)
        public static let inkSecondary = Color(hex: 0x50565D)
        public static let inkTertiary = Color(hex: 0x636B73)
        public static let background = Color(hex: 0xF7F8FA)
        public static let surface = Color(hex: 0xFFFFFF)
        public static let surfaceSunken = Color(hex: 0xEFF1F4)
        public static let outline = Color(hex: 0x7A828C)
        public static let outlineVariant = Color(hex: 0xE0E4E8)
        public static let success = Color(hex: 0x166534)
        public static let successContainer = Color(hex: 0xDCFCE7)
        public static let warning = Color(hex: 0x92400E)
        public static let warningContainer = Color(hex: 0xFEF3C7)
        public static let error = Color(hex: 0x991B1B)
        public static let errorContainer = Color(hex: 0xFEE2E2)
        public static let info = Color(hex: 0x075985)
        public static let infoContainer = Color(hex: 0xE0F2FE)
        public static let focus = Color(hex: 0x075985)
        public static let disabled = Color(hex: 0xE0E4E8)
        public static let onDisabled = Color(hex: 0x50565D)
        public static let scrim = Color(hex: 0x2E3236, opacity: 0.48)
        public static let gradientCtaStart = Color(hex: 0xFA7020)
        public static let gradientCtaMid = Color(hex: 0xEE6417)
        public static let gradientCtaEnd = Color(hex: 0xE8590C)
    }

    public enum Radius {
        public static let radiusCard: CGFloat = 20
        public static let radiusSheet: CGFloat = 28
        public static let radiusField: CGFloat = 16
        public static let radiusPill: CGFloat = 999
        public static let radiusThumb: CGFloat = 14
    }

    public enum Spacing {
        public static let touchTarget: CGFloat = 48
        public static let touchGap: CGFloat = 8
        public static let spaceScreen: CGFloat = 16
        public static let spaceGroup: CGFloat = 24
        public static let spaceInner: CGFloat = 12
        public static let grid: CGFloat = 8
        public static let ctaHeight: CGFloat = 56
        public static let secondaryHeight: CGFloat = 48
        public static let chipHeight: CGFloat = 40
        public static let bottomBarInset: CGFloat = 24
    }

    public enum Typography {
        public static let titleScreen = TypeToken(size: 26, line: 32, weight: .bold)
        public static let titleSection = TypeToken(size: 18, line: 24, weight: .bold)
        public static let body = TypeToken(size: 15, line: 22, weight: .regular)
        public static let bodySecondary = TypeToken(size: 13, line: 18, weight: .regular)
        public static let cta = TypeToken(size: 18, line: 24, weight: .bold)
        public static let chip = TypeToken(size: 14, line: nil, weight: .semibold)
    }

    public enum Elevation {
        public static let elevation1: [ShadowLayer] = [ShadowLayer(x: 0, y: 1, blur: 2, color: Color(hex: 0x2E3236, opacity: 0.06)), ShadowLayer(x: 0, y: 4, blur: 12, color: Color(hex: 0x2E3236, opacity: 0.06))]
        public static let elevation2: [ShadowLayer] = [ShadowLayer(x: 0, y: 2, blur: 6, color: Color(hex: 0x2E3236, opacity: 0.08)), ShadowLayer(x: 0, y: 10, blur: 24, color: Color(hex: 0x2E3236, opacity: 0.1))]
        public static let elevation3: [ShadowLayer] = [ShadowLayer(x: 0, y: 6, blur: 16, color: Color(hex: 0xEE6417, opacity: 0.35))]
    }
}
