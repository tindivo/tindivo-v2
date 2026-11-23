package com.tindivo.customer.feature.addresses

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla. [onDone] se llama al guardar, al borrar y si la sesión se cierra. */
@Composable
internal fun AddressFormDestination(
    viewModel: AddressFormViewModel,
    onDone: () -> Unit,
    onChanged: () -> Unit,
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(state.outcome) {
        if (state.outcome is FormOutcome.Saved || state.outcome == FormOutcome.Deleted) onChanged()
        if (state.outcome != null) onDone()
    }
    AddressFormScreen(
        state = state,
        actions =
            AddressFormActions(
                onLabel = viewModel::onLabel,
                onLine = viewModel::onLine,
                onReference = viewModel::onReference,
                onMakeDefault = viewModel::onMakeDefault,
                onPointChosen = viewModel::onPointChosen,
                onLocationPermission = viewModel::onLocationPermission,
                onStopLocating = viewModel::stopLocating,
                onForegroundChanged = viewModel::onForegroundChanged,
                onSave = viewModel::save,
                onAskDelete = viewModel::askDelete,
                onCancelDelete = viewModel::cancelDelete,
                onConfirmDelete = viewModel::confirmDelete,
                onRetry = viewModel::load,
                onCancel = onDone,
            ),
    )
}

internal class AddressFormActions(
    val onLabel: (String) -> Unit,
    val onLine: (String) -> Unit,
    val onReference: (String) -> Unit,
    val onMakeDefault: (Boolean) -> Unit,
    val onPointChosen: (GeoPoint) -> Unit,
    /** «Usar mi ubicación», con el permiso ya resuelto por la pantalla. */
    val onLocationPermission: (LocationPermission) -> Unit,
    /** El formulario sale de la pantalla: se cancela la lectura del GPS en curso. */
    val onStopLocating: () -> Unit,
    /** La app pasa a segundo plano (`false`) o vuelve (`true`): fuera de la vista no se lee el GPS (CAX-001). */
    val onForegroundChanged: (Boolean) -> Unit,
    val onSave: () -> Unit,
    val onAskDelete: () -> Unit,
    val onCancelDelete: () -> Unit,
    val onConfirmDelete: () -> Unit,
    val onRetry: () -> Unit,
    val onCancel: () -> Unit,
)

@Composable
internal fun AddressFormScreen(
    state: AddressFormState,
    actions: AddressFormActions,
) {
    // Solo la barra de estado: el mapa del primer paso llega hasta abajo y cada paso pone su propio margen inferior.
    Scaffold(contentWindowInsets = WindowInsets.statusBars) { innerPadding ->
        AddressFormContent(
            state = state,
            actions = actions,
            showCloseOnMap = true,
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            header = {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text =
                            stringResource(
                                if (state.editingId == null) {
                                    R.string.address_form_new_title
                                } else {
                                    R.string.address_form_edit_title
                                },
                            ),
                        style = MaterialTheme.typography.headlineMedium,
                        modifier = Modifier.weight(1f).semantics { heading() },
                    )
                    TextButton(onClick = actions.onCancel, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(text = stringResource(R.string.address_form_cancel))
                    }
                }
            },
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun AddressFormPreview() {
    TindivoTheme {
        AddressFormScreen(
            state = AddressFormState(loading = false, line = "Jr. Sucre 412", reference = "Frente a la bodega"),
            actions =
                AddressFormActions({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}),
        )
    }
}
