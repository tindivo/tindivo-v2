package com.tindivo.customer.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoIcons

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

/** El estado como pastilla de color; el texto dice lo mismo que el color y el ícono (check o cruz) lo refuerza. */
@Composable
internal fun StatusPill(
    text: String,
    tone: StatusTone,
    modifier: Modifier = Modifier,
) {
    val (container, content) = tone.colors()
    val icon: ImageVector? =
        when (tone) {
            StatusTone.Success -> TindivoIcons.Check
            StatusTone.Cancelled -> TindivoIcons.Close
            else -> null
        }
    Surface(shape = CircleShape, color = container, contentColor = content, modifier = modifier) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (icon != null) Icon(icon, contentDescription = null, modifier = Modifier.size(12.dp))
            Text(text = text, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, maxLines = 1)
        }
    }
}
