package com.tindivo.customer.feature.addresses

import androidx.compose.foundation.layout.Arrangement
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
