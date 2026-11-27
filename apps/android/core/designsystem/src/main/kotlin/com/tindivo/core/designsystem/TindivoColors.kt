package com.tindivo.core.designsystem

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * La paleta de Tindivo según el sistema de diseño v3.1 (`Docs/negocio/sistema-de-diseno.md`): naranja de marca, tinta
 * fría y fondo `#F7F8FA`. La marca sigue en `#F97316`, y el primario (los botones con texto blanco) es `#C2410C`
 * (decisión de Jesús, 2026-11-21). Solo hay tema claro, como en la web: el manual de marca no define uno oscuro.
 *
 * Quien dibuja una pantalla no usa estos valores directamente: usa `MaterialTheme.colorScheme`. Las dos excepciones
 * están en [TindivoColors]: el naranja para texto y los pares de aviso, que Material 3 no tiene.
 */
internal object Palette {
    val Brand = Color(color = 0xFFF97316)
    val BrandDark = Color(color = 0xFFC2410C)
    val BrandDeep = Color(color = 0xFF9A3412)
    val BrandSoft = Color(color = 0xFFFFF7ED)
    val BrandPressed = Color(color = 0xFF9A3412)
    val BrandMark = Color(color = 0xFFFA7020)
    val CtaMid = Color(color = 0xFFEE6417)
    val CtaEnd = Color(color = 0xFFE8590C)

    val Ink = Color(color = 0xFF2E3236)
    val InkMuted = Color(color = 0xFF50565D)
    val InkTertiary = Color(color = 0xFF636B73)
    val Outline = Color(color = 0xFF7A828C)

    val Surface = Color(color = 0xFFF7F8FA)
    val SurfaceLow = Color(color = 0xFFEFF1F4)
    val SurfaceMid = Color(color = 0xFFEFF1F4)
    val Card = Color(color = 0xFFFFFFFF)
    val Border = Color(color = 0xFFE0E4E8)

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
 * - `primary` es el fondo de los botones con texto blanco: `#C2410C`, que con blanco da 5,2:1 (decisión de Jesús,
 *   2026-11-21). El naranja de marca `#F97316` ([TindivoColors.brand]) queda para el isotipo
 *   y los acentos decorativos: no lleva texto encima. Para texto o enlaces en naranja se usa [TindivoColors.brandText].
 * - `secondary` es la tinta: el botón oscuro de la web.
 * - `tertiary` es el verde de «todo bien» (entregado, verificado).
 * - Las tarjetas van en blanco sobre el fondo, con sombra suave y sin borde: ver [TindivoCard].
 */
internal val TindivoLightColors: ColorScheme =
    lightColorScheme(
        primary = Palette.BrandDark,
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
        outline = Palette.Outline,
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
    /** Naranja de marca (`#F97316`): isotipo, acentos y degradados; nunca fondo de texto. */
    val brand: Color = Palette.Brand

    /** Naranja para TEXTO y enlaces sobre fondo claro. Nunca `colorScheme.primary` como color de letra. */
    val brandText: Color = Palette.BrandDark

    /** Verde de lo que salió bien (el check de un campo válido): 5,0:1 sobre blanco. */
    val success: Color = Palette.Success

    /** Aviso que no es error (pago pendiente, espera): fondo y letra. */
    val warningContainer: Color = Palette.WarningSoft
    val onWarningContainer: Color = Palette.WarningDeep
    val warning: Color = Palette.Warning

    /** Texto apagado: etiquetas, placeholder y metadatos (`inkTertiary`, 5,41:1 sobre el fondo). */
    val textMuted: Color = Palette.InkTertiary

    /** Presionado del CTA (`primaryPressed`): `#9A3412`, más oscuro que `primary` (`#C2410C`). */
    val primaryPressed: Color = Palette.BrandPressed

    /** Degradado decorativo de las tarjetas de servicio (`gradientCta`): el texto blanco va en la mitad oscura. */
    val gradientCta: List<Color> = listOf(Palette.BrandMark, Palette.CtaMid, Palette.CtaEnd)

    /**
     * Degradado de una franja con texto blanco arriba a la izquierda (Entregas): empieza en `#C2410C`, que con blanco
     * da 5,2:1; `#FA7020` daría 2,8:1. Sigue la diagonal por defecto de `Brush.linearGradient`.
     */
    val gradientUnderText: List<Color> = listOf(Palette.BrandDark, Palette.CtaEnd, Palette.BrandMark)

    /** Sombra de las tarjetas (`elevation1`, rgba(46,50,54,.06)): el tono de la tinta. */
    val shadow: Color = Palette.Ink

    /** Divisor dentro de una superficie. */
    val border: Color = Palette.Border
}
