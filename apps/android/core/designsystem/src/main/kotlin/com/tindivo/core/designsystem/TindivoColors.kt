package com.tindivo.core.designsystem

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * La paleta de Tindivo, la misma de la web (`packages/ui/src/theme.css`): naranja de marca, tinta cálida y superficie
 * crema. Solo hay tema claro, como en la web: el manual de marca no define uno oscuro.
 *
 * Quien dibuja una pantalla no usa estos valores directamente: usa `MaterialTheme.colorScheme`. Las dos excepciones
 * están en [TindivoColors]: el naranja para texto y los pares de aviso, que Material 3 no tiene.
 */
internal object Palette {
    val Brand = Color(color = 0xFFF97316)
    val BrandDark = Color(color = 0xFFC2410C)
    val BrandDeep = Color(color = 0xFF9A3412)
    val BrandSoft = Color(color = 0xFFFFF7ED)

    val Ink = Color(color = 0xFF1A1614)
    val InkMuted = Color(color = 0xFF57534E)
    val InkSubtle = Color(color = 0xFFA8A29E)

    val Surface = Color(color = 0xFFFAF6F1)
    val SurfaceLow = Color(color = 0xFFF0EBE3)
    val SurfaceMid = Color(color = 0xFFF5F1EB)
    val Card = Color(color = 0xFFFFFFFF)
    val Border = Color(color = 0xFFEAE7E2)

    val Success = Color(color = 0xFF15803D)
    val SuccessSoft = Color(color = 0xFFDCFCE7)
    val SuccessDeep = Color(color = 0xFF166534)
    val Warning = Color(color = 0xFFB45309)
    val WarningSoft = Color(color = 0xFFFEF3C7)
    val WarningDeep = Color(color = 0xFF92400E)
    val Danger = Color(color = 0xFFDC2626)
    val DangerSoft = Color(color = 0xFFFEE2E2)
    val DangerDeep = Color(color = 0xFF991B1B)
}

/**
 * El esquema de Material 3 con la paleta de Tindivo.
 *
 * - `primary` es el naranja de los botones, con texto blanco (decisión de Jesús, 2026-09-19: blanco sobre naranja).
 *   Blanco sobre `#F97316` da 2.8:1: sirve para la etiqueta gruesa de un botón, NO para texto corrido. Para texto o
 *   enlaces en naranja se usa [TindivoColors.brandText] (`#C2410C`, 5.2:1 sobre blanco).
 * - `secondary` es la tinta: el botón oscuro de la web.
 * - `tertiary` es el verde de «todo bien» (entregado, verificado).
 * - Las tarjetas van en blanco sobre la superficie crema, con borde: ver [TindivoCard].
 */
internal val TindivoLightColors: ColorScheme =
    lightColorScheme(
        primary = Palette.Brand,
        onPrimary = Color.White,
        primaryContainer = Palette.BrandSoft,
        onPrimaryContainer = Palette.BrandDeep,
        secondary = Palette.Ink,
        onSecondary = Color.White,
        secondaryContainer = Palette.SurfaceLow,
        onSecondaryContainer = Palette.Ink,
        tertiary = Palette.Success,
        onTertiary = Color.White,
        tertiaryContainer = Palette.SuccessSoft,
        onTertiaryContainer = Palette.SuccessDeep,
        error = Palette.Danger,
        onError = Color.White,
        errorContainer = Palette.DangerSoft,
        onErrorContainer = Palette.DangerDeep,
        background = Palette.Surface,
        onBackground = Palette.Ink,
        surface = Palette.Surface,
        onSurface = Palette.Ink,
        surfaceVariant = Palette.SurfaceLow,
        onSurfaceVariant = Palette.InkMuted,
        surfaceTint = Color.Transparent,
        outline = Palette.InkSubtle,
        outlineVariant = Palette.Border,
        surfaceContainerLowest = Palette.Card,
        surfaceContainerLow = Palette.Card,
        surfaceContainer = Palette.SurfaceMid,
        surfaceContainerHigh = Palette.SurfaceLow,
        surfaceContainerHighest = Palette.SurfaceLow,
        inverseSurface = Palette.Ink,
        inverseOnSurface = Palette.Surface,
        inversePrimary = Color(color = 0xFFFDBA74),
        scrim = Palette.Ink,
    )

/** Lo que la paleta de Tindivo tiene y Material 3 no. Todo par texto/fondo de aquí pasa 4.5:1. */
object TindivoColors {
    /** Naranja para TEXTO y enlaces sobre fondo claro. Nunca `colorScheme.primary` como color de letra. */
    val brandText: Color = Palette.BrandDark

    /** Aviso que no es error (pago pendiente, espera): fondo y letra. */
    val warningContainer: Color = Palette.WarningSoft
    val onWarningContainer: Color = Palette.WarningDeep
    val warning: Color = Palette.Warning

    /** Borde fino de tarjetas y separadores. */
    val border: Color = Palette.Border
}
