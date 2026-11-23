package com.tindivo.customer.feature.addresses

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.network.AppError
import com.tindivo.customer.R
import com.tindivo.customer.ui.fields.AddressLineField
import com.tindivo.customer.ui.fields.NoteField

/**
 * El cuerpo del formulario sin marco: cargando, el fallo de carga o los dos pasos (mapa y datos). Lo usan la pantalla
 * de Mi cuenta y la hoja del checkout, cada una con su forma de cerrar. [header] (el título, en la pantalla) solo se
 * pinta fuera del mapa, que ocupa todo el espacio; [showCloseOnMap] pone un «Cancelar» sobre el mapa para quien no
 * tiene otro (la hoja ya trae su «Cerrar»).
 */
@Composable
internal fun AddressFormContent(
    state: AddressFormState,
    actions: AddressFormActions,
    modifier: Modifier = Modifier,
    showCloseOnMap: Boolean = false,
    header: @Composable () -> Unit = {},
) {
    when {
        state.loading -> {
            Column(modifier = modifier) {
                header()
                Loading()
            }
        }

        state.loadError != null -> {
            Column(modifier = modifier) {
                header()
                LoadFailure(state.loadError, actions.onRetry)
            }
        }

        else -> {
            AddressSteps(state, actions, modifier, showCloseOnMap, header)
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
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
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

/**
 * Paso 1: el mapa. Paso 2: calle, referencia y qué lugar es. Una dirección nueva abre en el mapa; una que se corrige
 * y ya tiene su punto, en los datos (con «Cambiar» para volver al mapa). El paso sobrevive al giro.
 */
@Composable
private fun AddressSteps(
    state: AddressFormState,
    actions: AddressFormActions,
    modifier: Modifier,
    showCloseOnMap: Boolean,
    header: @Composable () -> Unit,
) {
    var onMap by rememberSaveable { mutableStateOf(state.point == null) }
    // Atrás en los datos vuelve al mapa sin perder lo escrito (vive en el ViewModel); atrás en el mapa cierra como antes.
    BackHandler(enabled = !onMap) { onMap = true }
    if (onMap) {
        MapStep(state, actions, modifier, showCloseOnMap, onConfirm = { onMap = false })
    } else {
        DetailsStep(state, actions, modifier, header, onChangePoint = { onMap = true })
    }
}

@Composable
private fun MapStep(
    state: AddressFormState,
    actions: AddressFormActions,
    modifier: Modifier,
    showClose: Boolean,
    onConfirm: () -> Unit,
) {
    val point = state.point
    val outside = point != null && !state.area.contains(point)
    val mapDescription = stringResource(R.string.address_form_map_description)
    Box(modifier = modifier.fillMaxSize()) {
        AddressMap(
            area = state.area,
            point = point,
            located = state.locate.located,
            onPointChosen = actions.onPointChosen,
            modifier = Modifier.fillMaxSize().semantics { contentDescription = mapDescription },
        )
        Row(
            modifier = Modifier.align(Alignment.TopStart).fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (showClose) {
                Surface(shape = MaterialTheme.shapes.extraLarge, shadowElevation = 4.dp) {
                    IconButton(onClick = actions.onCancel, modifier = Modifier.size(48.dp)) {
                        Icon(TindivoIcons.Close, contentDescription = stringResource(R.string.address_form_cancel))
                    }
                }
            }
            Surface(
                shape = MaterialTheme.shapes.extraLarge,
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 4.dp,
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    text = stringResource(R.string.address_step_map_hint),
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp).semantics { heading() },
                )
            }
        }
        Column(
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
            horizontalAlignment = Alignment.End,
        ) {
            Box(modifier = Modifier.padding(end = 16.dp, bottom = 12.dp)) {
                UseMyLocation(
                    state = state,
                    onPermission = actions.onLocationPermission,
                    onLeave = actions.onStopLocating,
                    onForegroundChanged = actions.onForegroundChanged,
                )
            }
            ConfirmPanel(outside = outside, enabled = point != null && !outside, onConfirm = onConfirm)
        }
    }
}

/** El botón fijo de abajo del mapa. Fuera de la zona de reparto lo dice y no deja confirmar. */
@Composable
private fun ConfirmPanel(
    outside: Boolean,
    enabled: Boolean,
    onConfirm: () -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 8.dp, modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.navigationBarsPadding().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (outside) {
                Text(
                    text = stringResource(R.string.address_form_outside_zone),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
            TindivoPrimaryButton(
                text = stringResource(R.string.address_step_confirm),
                onClick = onConfirm,
                enabled = enabled,
            )
        }
    }
}

@Composable
private fun DetailsStep(
    state: AddressFormState,
    actions: AddressFormActions,
    modifier: Modifier,
    header: @Composable () -> Unit,
    onChangePoint: () -> Unit,
) {
    var submitted by rememberSaveable { mutableStateOf(false) }
    val lineFocus = remember { FocusRequester() }
    val referenceFocus = remember { FocusRequester() }
    // El foco va solo al primer campo vacío (y solo al llegar: girar la pantalla no vuelve a abrir el teclado).
    val focusLine = remember { state.line.isBlank() }
    val focusReference = remember { state.line.isNotBlank() && state.reference.isBlank() }
    // «Guardar» siempre se puede tocar: si falta algo, lleva a ese campo y enseña el error.
    val trySave: () -> Unit = {
        submitted = true
        when (state.missing) {
            MissingField.Location, MissingField.OutsideZone -> onChangePoint()
            MissingField.Line -> lineFocus.requestFocus()
            MissingField.Reference -> referenceFocus.requestFocus()
            null -> actions.onSave()
        }
    }
    val lineOk = isLineOk(state.line)
    val referenceOk = isReferenceOk(state.reference)
    Column(modifier = modifier.fillMaxSize().imePadding()) {
        header()
        Column(
            modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PointSummary(outside = state.missing == MissingField.OutsideZone, onChange = onChangePoint)
            AddressLineField(
                value = state.line,
                onValueChange = actions.onLine,
                label = stringResource(R.string.address_form_line),
                placeholder = stringResource(R.string.address_form_line_placeholder),
                enabled = !state.busy,
                error = if (lineOk) null else stringResource(R.string.address_form_line_error),
                submitted = submitted,
                valid = lineOk,
                maxLength = ADDRESS_LINE_MAX,
                focusRequester = lineFocus,
                autoFocus = focusLine,
            )
            NoteField(
                value = state.reference,
                onValueChange = actions.onReference,
                label = stringResource(R.string.address_form_reference),
                placeholder = stringResource(R.string.address_form_reference_placeholder),
                enabled = !state.busy,
                error = if (referenceOk) null else stringResource(R.string.address_form_reference_error),
                submitted = submitted,
                valid = referenceOk,
                maxLength = ADDRESS_REFERENCE_MAX,
                imeAction = ImeAction.Done,
                onImeAction = trySave,
                focusRequester = referenceFocus,
                autoFocus = focusReference,
            )
            PlacePicker(selected = state.label, enabled = !state.busy, onSelect = actions.onLabel)
            if (!state.hideDefaultSwitch) DefaultSwitch(state.makeDefault, !state.busy, actions.onMakeDefault)
            if (state.saveError != null) SaveError(state.saveError)
            if (state.editingId != null) DeleteSection(state, actions)
        }
        Box(modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp)) {
            TindivoPrimaryButton(
                text =
                    stringResource(
                        if (state.editingId == null) R.string.address_form_save else R.string.address_form_save_changes,
                    ),
                onClick = trySave,
                enabled = !state.busy,
                loading = state.saving,
            )
        }
    }
}

@Composable
private fun PointSummary(
    outside: Boolean,
    onChange: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        if (outside) {
            Text(
                text = stringResource(R.string.address_form_outside_zone),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.weight(1f),
            )
        } else {
            Icon(TindivoIcons.Check, contentDescription = null, tint = TindivoColors.success)
            Text(
                text = stringResource(R.string.address_step_point_ok),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f).padding(start = 8.dp),
            )
        }
        TextButton(onClick = onChange, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(text = stringResource(R.string.address_step_change_point))
        }
    }
}

/** «¿Qué lugar es?», al final: «Casa» ya viene marcada. */
@Composable
private fun PlacePicker(
    selected: String,
    enabled: Boolean,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(text = stringResource(R.string.address_form_place), style = MaterialTheme.typography.titleSmall)
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
