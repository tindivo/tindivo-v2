// GENERADO por packages/design-tokens/src/cli.ts desde packages/design-tokens/tokens.json
// (que refleja Docs/negocio/sistema-de-diseno.md). No se edita a mano: se cambia el JSON y se corre `pnpm tokens:build`.

package com.tindivo.core.designsystem.tokens

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Un estilo de texto: la familia (Geist) la pone quien lo usa. */
data class TypeToken(
    val size: TextUnit,
    val line: TextUnit,
    val weight: FontWeight,
)

/** Una capa de sombra; una elevación es una lista de capas. */
data class ShadowLayer(
    val x: Dp,
    val y: Dp,
    val blur: Dp,
    val color: Color,
)

object TindivoTokens {
    const val FONT_FAMILY = "Geist"

    object Colors {
        val primary: Color = Color(0xFFEE6417)
        val primaryPressed: Color = Color(0xFFCF4A0C)
        val onPrimary: Color = Color(0xFFFFFFFF)
        val primaryText: Color = Color(0xFFC2410C)
        val brand: Color = Color(0xFFFA7020)
        val primaryContainer: Color = Color(0xFFFFF7ED)
        val onPrimaryContainer: Color = Color(0xFF9A3412)
        val secondary: Color = Color(0xFF2E3236)
        val onSecondary: Color = Color(0xFFFFFFFF)
        val ink: Color = Color(0xFF2E3236)
        val inkSecondary: Color = Color(0xFF50565D)
        val inkTertiary: Color = Color(0xFF636B73)
        val background: Color = Color(0xFFF7F8FA)
        val surface: Color = Color(0xFFFFFFFF)
        val surfaceSunken: Color = Color(0xFFEFF1F4)
        val outline: Color = Color(0xFF7A828C)
        val outlineVariant: Color = Color(0xFFE0E4E8)
        val success: Color = Color(0xFF166534)
        val successContainer: Color = Color(0xFFDCFCE7)
        val warning: Color = Color(0xFF92400E)
        val warningContainer: Color = Color(0xFFFEF3C7)
        val error: Color = Color(0xFF991B1B)
        val errorContainer: Color = Color(0xFFFEE2E2)
        val info: Color = Color(0xFF075985)
        val infoContainer: Color = Color(0xFFE0F2FE)
        val focus: Color = Color(0xFF075985)
        val disabled: Color = Color(0xFFE0E4E8)
        val onDisabled: Color = Color(0xFF50565D)
        val scrim: Color = Color(0x7A2E3236)
        val gradientCtaStart: Color = Color(0xFFFA7020)
        val gradientCtaMid: Color = Color(0xFFEE6417)
        val gradientCtaEnd: Color = Color(0xFFE8590C)
    }

    object Radius {
        val radiusCard: Dp = 20.dp
        val radiusSheet: Dp = 28.dp
        val radiusField: Dp = 16.dp
        val radiusPill: Dp = 999.dp
        val radiusThumb: Dp = 14.dp
    }

    object Spacing {
        val touchTarget: Dp = 48.dp
        val touchGap: Dp = 8.dp
        val spaceScreen: Dp = 16.dp
        val spaceGroup: Dp = 24.dp
        val spaceInner: Dp = 12.dp
        val grid: Dp = 8.dp
        val ctaHeight: Dp = 56.dp
        val secondaryHeight: Dp = 48.dp
        val chipHeight: Dp = 40.dp
        val bottomBarInset: Dp = 24.dp
    }

    object Typography {
        val titleScreen = TypeToken(size = 26.sp, line = 32.sp, weight = FontWeight.Bold)
        val titleSection = TypeToken(size = 18.sp, line = 24.sp, weight = FontWeight.Bold)
        val body = TypeToken(size = 15.sp, line = 22.sp, weight = FontWeight.Normal)
        val bodySecondary = TypeToken(size = 13.sp, line = 18.sp, weight = FontWeight.Normal)
        val cta = TypeToken(size = 18.sp, line = 24.sp, weight = FontWeight.Bold)
        val chip = TypeToken(size = 14.sp, line = TextUnit.Unspecified, weight = FontWeight.SemiBold)
    }

    object Elevation {
        val elevation1 = listOf(ShadowLayer(x = 0.dp, y = 1.dp, blur = 2.dp, color = Color(0x0F2E3236)), ShadowLayer(x = 0.dp, y = 4.dp, blur = 12.dp, color = Color(0x0F2E3236)))
        val elevation2 = listOf(ShadowLayer(x = 0.dp, y = 2.dp, blur = 6.dp, color = Color(0x142E3236)), ShadowLayer(x = 0.dp, y = 10.dp, blur = 24.dp, color = Color(0x1A2E3236)))
        val elevation3 = listOf(ShadowLayer(x = 0.dp, y = 6.dp, blur = 16.dp, color = Color(0x59EE6417)))
    }
}
