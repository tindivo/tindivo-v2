package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R
import com.tindivo.customer.feature.cart.SINGLE

/** Un grupo de opciones: su cabecera con el avance y una fila por opción. */
@Composable
internal fun ModifierGroupSection(
    group: ModifierGroupUi,
    state: DishSheetState,
    onToggle: (ModifierOptionUi) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
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

@Composable
private fun GroupHeader(
    group: ModifierGroupUi,
    progress: GroupProgress,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = group.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            Text(
                text = counterText(progress),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (progress.required) {
                val label = if (progress.done) R.string.dish_group_done else R.string.dish_group_required
                Text(
                    text = stringResource(label),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (progress.done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                )
            }
            hintText(progress)?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun counterText(progress: GroupProgress): String =
    progress.max?.let { stringResource(R.string.dish_group_counter, progress.count, it) }
        ?: stringResource(R.string.dish_group_counter_unlimited, progress.count)

@Composable
private fun hintText(progress: GroupProgress): String? =
    when {
        progress.single -> stringResource(R.string.dish_group_pick_one)
        progress.max != null -> stringResource(R.string.dish_group_up_to, progress.max)
        else -> null
    }

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
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).then(selection),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // El control solo dibuja: el toque lo recibe toda la fila, que es lo que lee TalkBack.
        if (single) {
            RadioButton(selected = selected, onClick = null, enabled = enabled)
        } else {
            Checkbox(checked = selected, onCheckedChange = null, enabled = enabled)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = option.name, style = MaterialTheme.typography.bodyLarge)
            option.description?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Text(
            text = optionPriceText(state.optionPrice(group, option)),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
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
