package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R
import com.tindivo.customer.feature.cart.MAX_NOTE_LENGTH

/** Nombre, descripción y precio con la píldora de avance de lo obligatorio. */
@Composable
internal fun DishHeader(
    item: MenuItemUi,
    progress: RequiredProgress?,
) {
    // La foto ya no va aquí: es lo primero de la página y se colapsa sola (ver [DishPage]).
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = item.name,
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = 16.dp, start = 4.dp, end = 4.dp).semantics { heading() },
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
internal fun NoteCard(
    note: String,
    onChange: (String) -> Unit,
) {
    // Al enfocar la nota sube el teclado y la barra de abajo con él: mientras el teclado se mueve, el campo se vuelve a
    // llevar a la vista para que quede encima de la barra, nunca tapado.
    val requester = remember { BringIntoViewRequester() }
    var focused by remember { mutableStateOf(false) }
    val ime = WindowInsets.ime
    val density = LocalDensity.current
    LaunchedEffect(focused) {
        if (focused) {
            requester.bringIntoView()
            snapshotFlow { ime.getBottom(density) }.collect { requester.bringIntoView() }
        }
    }
    TindivoCard(modifier = Modifier.fillMaxWidth().padding(bottom = TindivoSpacing.screen)) {
        Column(modifier = Modifier.padding(TindivoSpacing.screen)) {
            OutlinedTextField(
                value = note,
                onValueChange = onChange,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .bringIntoViewRequester(requester)
                        .onFocusChanged { focused = it.isFocused },
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

