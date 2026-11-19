// GENERADO por packages/design-tokens/src/cli.ts desde packages/design-tokens/tokens.json.
// No se edita a mano: se cambia tokens.json y se corre `pnpm tokens:build`.

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
    val tracking: TextUnit,
)

object TindivoTokens {
    const val FONT_FAMILY = "Geist"

    object Colors {
        val brand: Color = Color(0xFFF97316)
        val brandDark: Color = Color(0xFFC2410C)
        val brandDeep: Color = Color(0xFF9A3412)
        val brandSoft: Color = Color(0xFFFFF7ED)
        val brandInverse: Color = Color(0xFFFDBA74)
        val ink: Color = Color(0xFF1A1614)
        val inkMuted: Color = Color(0xFF57534E)
        val inkSubtle: Color = Color(0xFFA8A29E)
        val surface: Color = Color(0xFFFAF6F1)
        val surfaceLow: Color = Color(0xFFF0EBE3)
        val surfaceMid: Color = Color(0xFFF5F1EB)
        val card: Color = Color(0xFFFFFFFF)
        val border: Color = Color(0xFFEAE7E2)
        val success: Color = Color(0xFF15803D)
        val successSoft: Color = Color(0xFFDCFCE7)
        val successDeep: Color = Color(0xFF166534)
        val warning: Color = Color(0xFFB45309)
        val warningSoft: Color = Color(0xFFFEF3C7)
        val warningDeep: Color = Color(0xFF92400E)
        val danger: Color = Color(0xFFDC2626)
        val dangerSoft: Color = Color(0xFFFEE2E2)
        val dangerDeep: Color = Color(0xFF991B1B)
    }

    object Radius {
        val extraSmall: Dp = 8.dp
        val small: Dp = 12.dp
        val medium: Dp = 16.dp
        val large: Dp = 20.dp
        val extraLarge: Dp = 28.dp
    }

    object Spacing {
        val hairline: Dp = 4.dp
        val tight: Dp = 8.dp
        val item: Dp = 12.dp
        val screen: Dp = 16.dp
        val section: Dp = 24.dp
        val hero: Dp = 32.dp
        val touchTarget: Dp = 48.dp
        val primaryButtonHeight: Dp = 52.dp
    }

    object Typography {
        val displayLarge = TypeToken(size = 36.sp, line = 42.sp, weight = FontWeight.Bold, tracking = -0.5.sp)
        val displayMedium = TypeToken(size = 32.sp, line = 38.sp, weight = FontWeight.Bold, tracking = -0.4.sp)
        val displaySmall = TypeToken(size = 28.sp, line = 34.sp, weight = FontWeight.Bold, tracking = -0.3.sp)
        val headlineLarge = TypeToken(size = 28.sp, line = 34.sp, weight = FontWeight.Bold, tracking = -0.3.sp)
        val headlineMedium = TypeToken(size = 24.sp, line = 30.sp, weight = FontWeight.Bold, tracking = -0.2.sp)
        val headlineSmall = TypeToken(size = 22.sp, line = 28.sp, weight = FontWeight.Bold, tracking = -0.2.sp)
        val titleLarge = TypeToken(size = 20.sp, line = 26.sp, weight = FontWeight.SemiBold, tracking = -0.1.sp)
        val titleMedium = TypeToken(size = 17.sp, line = 24.sp, weight = FontWeight.SemiBold, tracking = 0.sp)
        val titleSmall = TypeToken(size = 15.sp, line = 20.sp, weight = FontWeight.SemiBold, tracking = 0.sp)
        val bodyLarge = TypeToken(size = 16.sp, line = 24.sp, weight = FontWeight.Normal, tracking = 0.sp)
        val bodyMedium = TypeToken(size = 14.sp, line = 20.sp, weight = FontWeight.Normal, tracking = 0.sp)
        val bodySmall = TypeToken(size = 12.sp, line = 16.sp, weight = FontWeight.Normal, tracking = 0.sp)
        val labelLarge = TypeToken(size = 15.sp, line = 20.sp, weight = FontWeight.Bold, tracking = 0.sp)
        val labelMedium = TypeToken(size = 12.sp, line = 16.sp, weight = FontWeight.SemiBold, tracking = 0.sp)
        val labelSmall = TypeToken(size = 11.sp, line = 16.sp, weight = FontWeight.Medium, tracking = 0.1.sp)
    }
}
