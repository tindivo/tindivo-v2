package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R
import com.tindivo.customer.feature.cart.CartLine
import com.tindivo.customer.feature.cart.MAX_NOTE_LENGTH
import com.tindivo.customer.feature.cart.MAX_QUANTITY

private val PHOTO_HEIGHT = 240.dp

/**
 * La ficha de un plato (tablero «Plato»): foto grande, nombre de 26 sp, precio, cada grupo de opciones en su
 * tarjeta, la nota y, abajo y fija, la cantidad con el botón que lo agrega a la bolsa. Todo lo que se elige vive en
 * [DishSheetState]; aquí solo se dibuja y se avisa con [onAdd].
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
        containerColor = MaterialTheme.colorScheme.background,
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier =
                    Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = TindivoSpacing.screen),
                verticalArrangement = Arrangement.spacedBy(TindivoSpacing.screen),
            ) {
                DishHeader(item, state.requiredProgress())
                item.modifierGroups.forEach { group ->
                    ModifierGroupSection(group = group, state = state, onToggle = { state = state.toggle(group, it) })
                }
                NoteCard(note = state.note, onChange = { state = state.withNote(it) })
            }
            DishBottomBar(
                state = state,
                onQuantity = { state = state.withQuantity(it) },
                onAdd = { onAdd(state.toLine()) },
            )
        }
    }
}

@Composable
private fun DishHeader(
    item: MenuItemUi,
    progress: RequiredProgress?,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        // Decorativa a propósito: el nombre del plato está justo debajo. Sin foto, el isotipo sobre crema.
        DishPhoto(
            imageUrl = item.imageUrl,
            shape = MaterialTheme.shapes.large,
            markWidth = 72.dp,
            modifier = Modifier.fillMaxWidth().height(PHOTO_HEIGHT),
        )
        Text(
            text = item.name,
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = 10.dp, start = 4.dp, end = 4.dp).semantics { heading() },
        )
        item.description?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp, start = 4.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = item.price,
                style = MaterialTheme.typography.headlineSmall,
                color = TindivoColors.brandText,
                modifier = Modifier.weight(1f),
            )
            progress?.let { ProgressPill(it) }
        }
    }
}

/** «1 de 2 listas»: cuánto falta de lo obligatorio, a la vista antes de bajar. */
@Composable
private fun ProgressPill(progress: RequiredProgress) {
    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primaryContainer,
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
    ) {
        Text(
            text =
                pluralStringResource(
                    R.plurals.dish_required_progress,
                    progress.total,
                    progress.done,
                    progress.total,
                ),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
        )
    }
}

@Composable
private fun NoteCard(
    note: String,
    onChange: (String) -> Unit,
) {
    TindivoCard(modifier = Modifier.fillMaxWidth().padding(bottom = TindivoSpacing.screen)) {
        Column(modifier = Modifier.padding(TindivoSpacing.screen)) {
            OutlinedTextField(
                value = note,
                onValueChange = onChange,
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                label = { Text(stringResource(R.string.dish_note_label)) },
                placeholder = { Text(stringResource(R.string.dish_note_placeholder)) },
                supportingText = { Text(stringResource(R.string.dish_note_counter, note.length, MAX_NOTE_LENGTH)) },
                minLines = 2,
                maxLines = 4,
            )
        }
    }
}

/** La barra fija de abajo: la cantidad en una píldora y el botón principal, que dice qué falta o cuánto suma. */
@Composable
private fun DishBottomBar(
    state: DishSheetState,
    onQuantity: (Int) -> Unit,
    onAdd: () -> Unit,
) {
    val label =
        when (val cta = state.cta) {
            is DishCta.Add -> stringResource(R.string.dish_add_cta, cta.total)
            is DishCta.Complete -> pluralStringResource(R.plurals.dish_complete_cta, cta.missing, cta.missing)
        }
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        shadowElevation = 12.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier =
                Modifier
                    .navigationBarsPadding()
                    .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            QuantityStepper(quantity = state.quantity, onChange = onQuantity)
            TindivoPrimaryButton(
                text = label,
                onClick = onAdd,
                enabled = state.isValid,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun QuantityStepper(
    quantity: Int,
    onChange: (Int) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Surface(
        shape = CircleShape,
        color = scheme.surfaceContainerLowest,
        border = BorderStroke(1.dp, scheme.outline),
        modifier = Modifier.heightIn(min = TindivoSpacing.primaryButtonHeight),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = { onChange(quantity - 1) },
                enabled = quantity > 1,
                modifier = Modifier.size(TindivoSpacing.touchTarget),
                colors = IconButtonDefaults.iconButtonColors(containerColor = scheme.outlineVariant),
            ) {
                Icon(TindivoIcons.Remove, contentDescription = stringResource(R.string.dish_quantity_less))
            }
            Box(modifier = Modifier.widthIn(min = 32.dp), contentAlignment = Alignment.Center) {
                Text(text = quantity.toString(), style = MaterialTheme.typography.titleLarge)
            }
            IconButton(
                onClick = { onChange(quantity + 1) },
                enabled = quantity < MAX_QUANTITY,
                modifier = Modifier.size(TindivoSpacing.touchTarget),
                colors =
                    IconButtonDefaults.iconButtonColors(
                        containerColor = scheme.primaryContainer,
                        contentColor = TindivoColors.brandText,
                    ),
            ) {
                Icon(TindivoIcons.Add, contentDescription = stringResource(R.string.dish_quantity_more))
            }
        }
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
