package com.tindivo.core.designsystem

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private fun geist(weight: FontWeight) =
    Font(
        resId = R.font.geist,
        weight = weight,
        variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
    )

/**
 * La familia de la marca. El manual pide Geist para todo (p. 16).
 *
 * Es un solo TTF variable (`res/font/geist.ttf`, eje de peso de 400 a 700, recortado a latín: ver
 * `core/designsystem/fonts/README.md`); cada peso de la escala es una posición de ese eje. Un peso fuera de 400–700
 * exige regenerar la fuente.
 */
internal val TindivoFontFamily: FontFamily =
    FontFamily(
        geist(FontWeight.Normal),
        geist(FontWeight.Medium),
        geist(FontWeight.SemiBold),
        geist(FontWeight.Bold),
    )

private fun style(
    size: Int,
    line: Int,
    weight: FontWeight,
    tracking: Double = 0.0,
) = TextStyle(
    fontFamily = TindivoFontFamily,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = tracking.sp,
)

/**
 * La escala de la web (`--text-*` de `theme.css`) llevada a los nombres de Material 3. En el teléfono nada baja de
 * 11 sp y el cuerpo de los campos sube a 16 sp para que se lea a un brazo de distancia.
 *
 * Cómo se usa:
 * - `headlineSmall`: el título de una pantalla sin barra («Mi cuenta»).
 * - `titleLarge`: barra superior. `titleMedium`: nombre de negocio, de plato, importe en tarjeta.
 * - `titleSmall`: encabezado de sección dentro de una pantalla.
 * - `bodyLarge`: campos y texto principal. `bodyMedium`: texto de apoyo. `bodySmall`: notas y ayudas.
 * - `labelLarge`: botones. `labelMedium`: chips e insignias. `labelSmall`: metadatos (hora, distancia).
 * - `displaySmall`: una cifra protagonista (el total a pagar).
 */
internal val TindivoTypography =
    Typography(
        displayLarge = style(size = 36, line = 42, weight = FontWeight.Bold, tracking = -0.5),
        displayMedium = style(size = 32, line = 38, weight = FontWeight.Bold, tracking = -0.4),
        displaySmall = style(size = 28, line = 34, weight = FontWeight.Bold, tracking = -0.3),
        headlineLarge = style(size = 28, line = 34, weight = FontWeight.Bold, tracking = -0.3),
        headlineMedium = style(size = 24, line = 30, weight = FontWeight.Bold, tracking = -0.2),
        headlineSmall = style(size = 22, line = 28, weight = FontWeight.Bold, tracking = -0.2),
        titleLarge = style(size = 20, line = 26, weight = FontWeight.SemiBold, tracking = -0.1),
        titleMedium = style(size = 17, line = 24, weight = FontWeight.SemiBold),
        titleSmall = style(size = 15, line = 20, weight = FontWeight.SemiBold),
        bodyLarge = style(size = 16, line = 24, weight = FontWeight.Normal),
        bodyMedium = style(size = 14, line = 20, weight = FontWeight.Normal),
        bodySmall = style(size = 12, line = 16, weight = FontWeight.Normal),
        labelLarge = style(size = 15, line = 20, weight = FontWeight.Bold),
        labelMedium = style(size = 12, line = 16, weight = FontWeight.SemiBold),
        labelSmall = style(size = 11, line = 16, weight = FontWeight.Medium, tracking = 0.1),
    )
