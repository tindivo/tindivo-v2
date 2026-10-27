package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.tindivo.customer.R
import com.tindivo.customer.feature.cart.CartLine
import com.tindivo.customer.feature.cart.MAX_NOTE_LENGTH
import com.tindivo.customer.feature.cart.MAX_QUANTITY

/**
 * La ficha de un plato: foto, descripción, opciones, nota y cantidad, con el botón que lo agrega a la bolsa. Todo lo
 * que se elige vive en [DishSheetState]; aquí solo se dibuja y se avisa con [onAdd].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DishSheet(
    item: MenuItemUi,
    onDismiss: () -> Unit,
    onAdd: (CartLine) -> Unit,
) {
    var state by rememberSaveable(item.id, stateSaver = DishSheetState.saver(item)) {
        mutableStateOf(DishSheetState(item))
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier =
                    Modifier
                        .weight(
                            1f,
                            fill = false,
                        ).verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp),
            ) {
                DishHeader(item)
                item.modifierGroups.forEach { group ->
                    ModifierGroupSection(group = group, state = state, onToggle = { state = state.toggle(group, it) })
                }
                OutlinedTextField(
                    value = state.note,
                    onValueChange = { state = state.withNote(it) },
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                    label = { Text(stringResource(R.string.dish_note_label)) },
                    placeholder = { Text(stringResource(R.string.dish_note_placeholder)) },
                    supportingText = {
                        Text(stringResource(R.string.dish_note_counter, state.note.length, MAX_NOTE_LENGTH))
                    },
                    minLines = 2,
                    maxLines = 4,
                )
                QuantityRow(quantity = state.quantity, onChange = { state = state.withQuantity(it) })
            }
            AddButton(state = state, onClick = { onAdd(state.toLine()) })
        }
    }
}

@Composable
private fun DishHeader(item: MenuItemUi) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        item.imageUrl?.let {
            // Decorativa a propósito: el nombre del plato está justo debajo.
            AsyncImage(
                model = it,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().height(180.dp),
            )
        }
        Text(text = item.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        item.description?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(text = item.price, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun QuantityRow(
    quantity: Int,
    onChange: (Int) -> Unit,
) {
    val less = stringResource(R.string.dish_quantity_less)
    val more = stringResource(R.string.dish_quantity_more)
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
    ) {
        Text(
            text = stringResource(R.string.dish_quantity_label),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.weight(1f),
        )
        OutlinedButton(
            onClick = { onChange(quantity - 1) },
            enabled = quantity > 1,
            modifier = Modifier.size(48.dp).semantics { contentDescription = less },
            contentPadding = PaddingValues(0.dp),
        ) {
            Text(text = "−")
        }
        Text(text = quantity.toString(), style = MaterialTheme.typography.titleMedium)
        OutlinedButton(
            onClick = { onChange(quantity + 1) },
            enabled = quantity < MAX_QUANTITY,
            modifier = Modifier.size(48.dp).semantics { contentDescription = more },
            contentPadding = PaddingValues(0.dp),
        ) {
            Text(text = "+")
        }
    }
}

@Composable
private fun AddButton(
    state: DishSheetState,
    onClick: () -> Unit,
) {
    val label =
        when (val cta = state.cta) {
            is DishCta.Add -> stringResource(R.string.dish_add_cta, cta.total)
            is DishCta.Complete -> pluralStringResource(R.plurals.dish_complete_cta, cta.missing, cta.missing)
        }
    Button(
        onClick = onClick,
        enabled = state.isValid,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(text = label)
    }
}

/** Preguntar antes de vaciar la bolsa de otro restaurante para empezar una en [newBusinessName]. */
@Composable
internal fun NewBagDialog(
    currentBusinessName: String,
    newBusinessName: String,
    onKeep: () -> Unit,
    onReplace: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onKeep,
        title = { Text(stringResource(R.string.dish_new_bag_title)) },
        text = { Text(stringResource(R.string.dish_new_bag_text, currentBusinessName, newBusinessName)) },
        dismissButton = {
            TextButton(onClick = onKeep, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.dish_new_bag_keep))
            }
        },
        confirmButton = {
            TextButton(onClick = onReplace, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.dish_new_bag_replace))
            }
        },
    )
}
