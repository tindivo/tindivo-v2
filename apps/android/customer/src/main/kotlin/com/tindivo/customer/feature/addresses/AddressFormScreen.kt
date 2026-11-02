package com.tindivo.customer.feature.addresses

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.core.network.AppError
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla. [onDone] se llama al guardar, al borrar y si la sesión se cierra. */
@Composable
internal fun AddressFormDestination(
    onDone: () -> Unit,
    onChanged: () -> Unit,
    viewModel: AddressFormViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(state.outcome) {
        if (state.outcome == FormOutcome.Saved || state.outcome == FormOutcome.Deleted) onChanged()
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
    Scaffold(
        bottomBar = { if (!state.loading && state.loadError == null) SaveBar(state, actions.onSave) },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text =
                        stringResource(
                            if (state.editingId ==
                                null
                            ) {
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
            when {
                state.loading -> Loading()
                state.loadError != null -> LoadFailure(state.loadError, actions.onRetry)
                else -> FormBody(state, actions)
            }
        }
    }
}

@Composable
private fun Loading() {
    val description = stringResource(R.string.addresses_loading)
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(modifier = Modifier.semantics { contentDescription = description })
    }
}

@Composable
private fun LoadFailure(
    error: AppError,
    onRetry: () -> Unit,
) {
    val message =
        when {
            error.isNotFound() || error.isMissingAtLoad() -> R.string.address_form_not_found
            error is AppError.Network -> R.string.error_network
            else -> R.string.error_generic
        }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = stringResource(message), style = MaterialTheme.typography.bodyLarge)
        Button(
            onClick = onRetry,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.addresses_retry))
        }
    }
}

@Composable
private fun FormBody(
    state: AddressFormState,
    actions: AddressFormActions,
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        LabelPicker(selected = state.label, enabled = !state.busy, onSelect = actions.onLabel)
        Text(text = stringResource(R.string.address_form_map_title), style = MaterialTheme.typography.titleSmall)
        val mapDescription = stringResource(R.string.address_form_map_description)
        AddressMap(
            area = state.area,
            point = state.point,
            onPointChosen = actions.onPointChosen,
            modifier = Modifier.fillMaxWidth().height(260.dp).semantics { contentDescription = mapDescription },
        )
        MapStatus(state)
        OutlinedTextField(
            value = state.line,
            onValueChange = actions.onLine,
            enabled = !state.busy,
            singleLine = true,
            label = { Text(text = stringResource(R.string.address_form_line)) },
            placeholder = { Text(text = stringResource(R.string.address_form_line_placeholder)) },
            isError = state.line.isNotBlank() && !isLineOk(state.line),
            supportingText = {
                if (state.line.isNotBlank() && !isLineOk(state.line)) {
                    Text(text = stringResource(R.string.address_form_line_error))
                }
            },
            modifier = Modifier.fillMaxWidth(),
        )
        ReferenceField(state, actions.onReference)
        if (!state.hideDefaultSwitch) DefaultSwitch(state.makeDefault, !state.busy, actions.onMakeDefault)
        if (state.saveError != null) SaveError(state.saveError)
        if (state.editingId != null) DeleteSection(state, actions)
    }
}

@Composable
private fun LabelPicker(
    selected: String,
    enabled: Boolean,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(text = stringResource(R.string.address_form_label), style = MaterialTheme.typography.titleSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ADDRESS_LABELS.forEach { label ->
                FilterChip(
                    selected = label == selected,
                    onClick = { onSelect(label) },
                    enabled = enabled,
                    label = { Text(text = stringResource(label.labelRes())) },
                    modifier = Modifier.heightIn(min = 48.dp),
                )
            }
        }
    }
}

private fun String.labelRes(): Int =
    when (this) {
        "Trabajo" -> R.string.address_label_trabajo
        "Otro" -> R.string.address_label_otro
        else -> R.string.address_label_casa
    }

@Composable
private fun MapStatus(state: AddressFormState) {
    when {
        state.point == null -> {
            Text(text = stringResource(R.string.address_form_map_hint), style = MaterialTheme.typography.bodySmall)
        }

        state.missing == MissingField.OutsideZone -> {
            Text(
                text = stringResource(R.string.address_form_outside_zone),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun ReferenceField(
    state: AddressFormState,
    onChange: (String) -> Unit,
) {
    val ok = isReferenceOk(state.reference)
    OutlinedTextField(
        value = state.reference,
        onValueChange = onChange,
        enabled = !state.busy,
        minLines = 2,
        label = { Text(text = stringResource(R.string.address_form_reference)) },
        placeholder = { Text(text = stringResource(R.string.address_form_reference_placeholder)) },
        supportingText = {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(text = if (ok) stringResource(R.string.address_form_reference_ok) else "")
                Text(
                    text =
                        stringResource(
                            R.string.address_form_reference_count,
                            state.reference.length,
                            ADDRESS_REFERENCE_MAX,
                        ),
                )
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun DefaultSwitch(
    checked: Boolean,
    enabled: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.address_form_default_switch),
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                text = stringResource(R.string.address_form_default_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

@Composable
private fun SaveError(error: AppError) {
    // El `detail` que explicó el servidor (por ejemplo, el motivo de un 422) se muestra tal cual.
    val detail = error.serverDetail()
    val text =
        when {
            detail != null -> detail
            error.isNotFound() -> stringResource(R.string.address_form_not_found)
            error is AppError.Network -> stringResource(R.string.error_network)
            else -> stringResource(R.string.error_generic)
        }
    Text(text = text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
}

@Preview(showBackground = true)
@Composable
private fun AddressFormPreview() {
    TindivoTheme {
        AddressFormScreen(
            state = AddressFormState(loading = false, line = "Jr. Sucre 412", reference = "Frente a la bodega"),
            actions =
                AddressFormActions({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}),
        )
    }
}
