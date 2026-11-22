package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons

/**
 * Una opción de una lista de elegir una (tablero «Checkout»): baldosa redondeada; la elegida va sobre crema con borde
 * naranja y el visto en un círculo. Apagada (`enabled = false`) sigue a la vista con su motivo en [hint], en vez de
 * esconderse. Para TalkBack sigue siendo un botón de radio. [leading] es el logo o el dibujo del medio de pago.
 */
@Composable
internal fun ChoiceRow(
    selected: Boolean,
    enabled: Boolean,
    title: String,
    hint: String?,
    onClick: () -> Unit,
    leading: (@Composable () -> Unit)? = null,
) {
    val scheme = MaterialTheme.colorScheme
    val color = if (enabled) scheme.onSurface else scheme.onSurfaceVariant
    val shape = RoundedCornerShape(18.dp)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .clip(shape)
                .background(if (selected) scheme.primaryContainer else Color.Transparent)
                .border(2.dp, if (selected) scheme.primary else Color.Transparent, shape)
                .selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = onClick)
                .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        leading?.invoke()
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = MaterialTheme.typography.titleMedium, color = color)
            hint?.let {
                Text(text = it, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            }
        }
        if (selected) {
            Box(
                modifier = Modifier.size(28.dp).background(scheme.primary, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    TindivoIcons.Check,
                    contentDescription = null,
                    tint = scheme.onPrimary,
                    modifier = Modifier.size(18.dp),
                )
            }
        } else {
            Box(
                modifier =
                    Modifier
                        .size(
                            28.dp,
                        ).border(2.dp, if (enabled) scheme.outline else scheme.outlineVariant, CircleShape),
            )
        }
    }
}
