package com.tindivo.customer.feature.addresses

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R

@Composable
internal fun DeleteSection(
    state: AddressFormState,
    actions: AddressFormActions,
) {
    if (!state.confirmingDelete) {
        OutlinedButton(
            onClick = actions.onAskDelete,
            enabled = !state.busy,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        ) {
            Text(text = stringResource(R.string.address_form_delete), color = MaterialTheme.colorScheme.error)
        }
        return
    }
    // La confirmación vive en la propia pantalla, no en un diálogo del sistema.
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = stringResource(R.string.address_form_delete_confirm_title),
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = stringResource(R.string.address_form_delete_confirm_body),
                style = MaterialTheme.typography.bodyMedium,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = actions.onCancelDelete,
                    enabled = !state.deleting,
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(text = stringResource(R.string.address_form_cancel))
                }
                Button(
                    onClick = actions.onConfirmDelete,
                    enabled = !state.deleting,
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(
                        text =
                            stringResource(
                                if (state.deleting) {
                                    R.string.address_form_deleting
                                } else {
                                    R.string.address_form_delete_confirm
                                },
                            ),
                    )
                }
            }
        }
    }
}

/** El botón fijo abajo, fuera del scroll: dice qué falta y, cuando no falta nada, guarda. */
@Composable
internal fun SaveBar(
    state: AddressFormState,
    onSave: () -> Unit,
) {
    val label =
        when {
            state.saving -> R.string.address_form_saving
            state.missing == MissingField.Location -> R.string.address_form_missing_location
            state.missing == MissingField.OutsideZone -> R.string.address_form_missing_outside
            state.missing == MissingField.Line -> R.string.address_form_missing_line
            state.missing == MissingField.Reference -> R.string.address_form_missing_reference
            state.editingId == null -> R.string.address_form_save
            else -> R.string.address_form_save_changes
        }
    Box(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        Button(
            onClick = onSave,
            enabled = state.canSave,
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        ) {
            Text(text = stringResource(label))
        }
    }
}
