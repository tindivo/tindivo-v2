package com.tindivo.core.designsystem

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * La familia de la marca. El manual pide Geist para todo (p. 16).
 *
 * PILOTO: hoy apunta a la del sistema; el lote del tema la cambia por Geist (res/font) si cabe en el techo de peso
 * (D-57). Todo el resto del archivo no cambia con eso.
 */
internal val TindivoFontFamily: FontFamily = FontFamily.Default

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
        displayLarge = style(36, 42, FontWeight.Bold, -0.5),
        displayMedium = style(32, 38, FontWeight.Bold, -0.4),
        displaySmall = style(28, 34, FontWeight.Bold, -0.3),
        headlineLarge = style(28, 34, FontWeight.Bold, -0.3),
        headlineMedium = style(24, 30, FontWeight.Bold, -0.2),
        headlineSmall = style(22, 28, FontWeight.Bold, -0.2),
        titleLarge = style(20, 26, FontWeight.SemiBold, -0.1),
        titleMedium = style(17, 24, FontWeight.SemiBold),
        titleSmall = style(15, 20, FontWeight.SemiBold),
        bodyLarge = style(16, 24, FontWeight.Normal),
        bodyMedium = style(14, 20, FontWeight.Normal),
        bodySmall = style(12, 16, FontWeight.Normal),
        labelLarge = style(15, 20, FontWeight.Bold),
        labelMedium = style(12, 16, FontWeight.SemiBold),
        labelSmall = style(11, 16, FontWeight.Medium, 0.1),
    )
