package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.customer.R
import com.tindivo.customer.feature.cart.SINGLE

/** Un grupo de opciones en su tarjeta (tablero «Plato»): cabecera con su estado y una fila por opción. */
@Composable
internal fun ModifierGroupSection(
    group: ModifierGroupUi,
    state: DishSheetState,
    onToggle: (ModifierOptionUi) -> Unit,
    modifier: Modifier = Modifier,
    highlighted: Boolean = false,
) {
    val scheme = MaterialTheme.colorScheme
    // Resaltado: borde de error de 2 dp alrededor de la tarjeta, para que se vea qué falta elegir.
    val outline = if (highlighted) Modifier.border(2.dp, scheme.error, MaterialTheme.shapes.large) else Modifier
    TindivoCard(modifier = modifier.fillMaxWidth().then(outline)) {
        Column(
            modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            GroupHeader(group = group, progress = state.progress(group))
            group.options.forEach { option ->
                OptionRow(
                    group = group,
                    option = option,
                    state = state,
                    onClick = { onToggle(option) },
                )
            }
        }
    }
}

@Composable
private fun GroupHeader(
    group: ModifierGroupUi,
    progress: GroupProgress,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, bottom = 2.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = group.name,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() },
            )
            // Sin contadores «0/1»: la píldora de la derecha dice «Obligatorio» o «Listo», y aquí solo cuánto se puede elegir.
            hintText(progress)?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        GroupStatusPill(progress)
    }
}

/** «Obligatorio» en ámbar mientras falta, «Listo» en verde con el visto, «Opcional» en gris. */
@Composable
private fun GroupStatusPill(progress: GroupProgress) {
    val scheme = MaterialTheme.colorScheme
    val text: Int
    val container: Color
    val content: Color
    when {
        progress.done -> {
            text = R.string.dish_group_done
            container = scheme.tertiaryContainer
            content = scheme.onTertiaryContainer
        }

        progress.required -> {
            text = R.string.dish_group_required
            container = TindivoColors.warningContainer
            content = TindivoColors.onWarningContainer
        }

        else -> {
            text = R.string.dish_group_optional
            container = scheme.outlineVariant
            content = scheme.onSurfaceVariant
        }
    }
    Surface(shape = CircleShape, color = container, contentColor = content) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (progress.done) Icon(TindivoIcons.Check, contentDescription = null, modifier = Modifier.size(14.dp))
            Text(text = stringResource(text), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun hintText(progress: GroupProgress): String? =
    when {
        progress.single -> stringResource(R.string.dish_group_pick_one)
        progress.max != null -> stringResource(R.string.dish_group_up_to, progress.max)
        else -> null
    }

/** Una opción: fila con borde y esquinas de 16 dp; la elegida, sobre crema y con el borde en `primary`. */
@Composable
private fun OptionRow(
    group: ModifierGroupUi,
    option: ModifierOptionUi,
    state: DishSheetState,
    onClick: () -> Unit,
) {
    val selected = state.isSelected(option)
    val enabled = !state.isDisabled(group, option)
    val single = group.selectionType == SINGLE
    val selection =
        if (single) {
            Modifier.selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = onClick)
        } else {
            Modifier.toggleable(
                value = selected,
                enabled = enabled,
                role = Role.Checkbox,
                onValueChange = { onClick() },
            )
        }
    val scheme = MaterialTheme.colorScheme
    val shape = MaterialTheme.shapes.medium
    val border = if (selected) BorderStroke(1.5.dp, scheme.primary) else BorderStroke(1.dp, scheme.outlineVariant)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .clip(shape)
                .background(if (selected) scheme.primaryContainer else scheme.surfaceContainerLowest)
                .border(border, shape)
                .then(selection)
                .padding(4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        // El control solo dibuja: el toque lo recibe toda la fila, que es lo que lee TalkBack.
        if (single) {
            RadioButton(selected = selected, onClick = null, enabled = enabled, modifier = Modifier.size(40.dp))
        } else {
            Checkbox(checked = selected, onCheckedChange = null, enabled = enabled, modifier = Modifier.size(40.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = option.name,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            )
            option.description?.let {
                Text(text = it, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            }
        }
        Text(
            text = optionPriceText(state.optionPrice(group, option)),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = scheme.onSurfaceVariant,
            modifier = Modifier.padding(end = 8.dp),
        )
    }
}

@Composable
private fun optionPriceText(price: OptionPrice): String =
    when (price) {
        OptionPrice.Included -> stringResource(R.string.dish_option_included)
        is OptionPrice.Delta -> stringResource(R.string.dish_option_delta, price.text)
        is OptionPrice.Total -> price.text
    }
