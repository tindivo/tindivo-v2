package com.tindivo.customer.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** El tono de una pastilla de estado: cada estado terminal tiene el suyo y no se confunden. */
internal enum class StatusTone { Active, Success, Cancelled, Neutral }

/** Colores `(fondo, texto)` de [tone], todos de los tokens del tema: éxito verde, cancelado rojo suave. */
@Composable
internal fun StatusTone.colors(): Pair<Color, Color> {
    val scheme = MaterialTheme.colorScheme
    return when (this) {
        StatusTone.Active -> scheme.primaryContainer to scheme.onPrimaryContainer
        StatusTone.Success -> scheme.tertiaryContainer to scheme.onTertiaryContainer
        StatusTone.Cancelled -> scheme.errorContainer to scheme.onErrorContainer
        StatusTone.Neutral -> scheme.surfaceVariant to scheme.onSurfaceVariant
    }
}
