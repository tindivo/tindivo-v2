package com.tindivo.core.designsystem

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Las esquinas de la web: campos de 12, tarjetas de 20, hojas de 28. Los botones de Material 3 ya son píldora.
 */
internal val TindivoShapes =
    Shapes(
        extraSmall = RoundedCornerShape(8.dp),
        small = RoundedCornerShape(12.dp),
        medium = RoundedCornerShape(16.dp),
        large = RoundedCornerShape(20.dp),
        extraLarge = RoundedCornerShape(28.dp),
    )

/**
 * Los únicos espacios que usa una pantalla. Un `dp` suelto en una pantalla es una señal de que falta un nombre aquí.
 *
 * - [screen]: margen lateral de toda pantalla. - [section]: entre bloques de una pantalla.
 * - [item]: entre elementos de un mismo bloque. - [tight]: entre un título y su texto de apoyo.
 */
object TindivoSpacing {
    val hairline: Dp = 4.dp
    val tight: Dp = 8.dp
    val item: Dp = 12.dp
    val screen: Dp = 16.dp
    val section: Dp = 24.dp
    val hero: Dp = 32.dp

    /** Alto mínimo de todo lo que se toca (Material y TalkBack piden 48). */
    val touchTarget: Dp = 48.dp

    /** Alto del botón principal de una pantalla, como el de la web. */
    val primaryButtonHeight: Dp = 52.dp
}

/**
 * El tema de Tindivo: paleta, letra y esquinas de la marca. Solo claro, como la web: seguir el modo oscuro del
 * sistema con colores que la marca no definió dejaba pantallas que nadie diseñó.
 */
@Composable
fun TindivoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = TindivoLightColors,
        typography = TindivoTypography,
        shapes = TindivoShapes,
        content = content,
    )
}
