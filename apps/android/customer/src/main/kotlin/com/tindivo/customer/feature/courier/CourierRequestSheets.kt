package com.tindivo.customer.feature.courier

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.customer.R
import com.tindivo.customer.feature.addresses.AddressMap
import com.tindivo.customer.feature.addresses.GeoPoint
import com.tindivo.customer.feature.checkout.AddressSheet
import com.tindivo.customer.feature.checkout.CheckoutSheetActions
import com.tindivo.customer.feature.checkout.ChoiceRow
import com.tindivo.customer.feature.checkout.PhoneSheet
import com.tindivo.customer.feature.checkout.ProfileSheet
import com.tindivo.customer.feature.checkout.SheetFrame

/**
 * La hoja abierta encima de «Pedir una entrega», si la hay y si la solicitud sigue en su fase. Agregar una dirección,
 * verificar el celular y completar el nombre reusan las hojas del checkout (su cuerpo y su ViewModel de «Mi cuenta»);
 * [opening] es la clave de ese ViewModel, para que reabrir la hoja no herede lo de la vez anterior. Al terminar, la hoja
 * avisa al ViewModel de Entregas, que comprueba que siga siendo la misma cuenta antes de aplicar nada.
 */
@Composable
internal fun CourierSheetHost(
    state: CourierRequestUiState,
    viewModel: CourierRequestViewModel,
    openSheet: (CourierSheet) -> Unit,
    opening: Int,
) {
    val sheet = state.sheet ?: return
    val phase = if (sheet == CourierSheet.CompleteProfile) RequestPhase.ProfileRequired else RequestPhase.Form
    if (state.phase != phase) return
    val key = "courier-sheet-$opening"
    val actions =
        CheckoutSheetActions(
            onOpen = {},
            onClose = viewModel::closeSheet,
            onPickAddress = {},
            onAddressSaved = viewModel::onAddressSaved,
            // Desde aquí la hoja solo agrega: no hay dirección que borrar.
            onAddressDeleted = viewModel::closeSheet,
            onPhoneVerified = viewModel::onPhoneVerified,
            onProfileCompleted = viewModel::onProfileCompleted,
        )
    when (sheet) {
        is CourierSheet.ChoosePoint -> {
            ChoosePointSheet(
                state = state,
                end = sheet.end,
                onClose = viewModel::closeSheet,
                onPickAddress = { id -> viewModel.pickAddress(sheet.end, id) },
                onPickContact = { index -> viewModel.pickContact(sheet.end, index) },
                openSheet = openSheet,
            )
        }

        is CourierSheet.AddAddress -> {
            AddressSheet(editingId = null, key = key, actions = actions)
        }

        is CourierSheet.PinOnMap -> {
            PinSheet(state = state, end = sheet.end, onClose = viewModel::closeSheet) { point, reference ->
                viewModel.pickPin(sheet.end, point, reference)
            }
        }

        CourierSheet.VerifyPhone -> {
            PhoneSheet(key, actions)
        }

        CourierSheet.CompleteProfile -> {
            ProfileSheet(key, actions)
        }
    }
}

/** «¿Dónde recogemos?» / «¿Dónde entregamos?»: marcar en el mapa, las direcciones guardadas y los sitios anteriores. */
@Composable
private fun ChoosePointSheet(
    state: CourierRequestUiState,
    end: CourierEnd,
    onClose: () -> Unit,
    onPickAddress: (String) -> Unit,
    onPickContact: (Int) -> Unit,
    openSheet: (CourierSheet) -> Unit,
) {
    SheetFrame(title = stringResource(end.chooseTitle()), onClose = onClose) {
        Column(
            modifier =
                Modifier
                    .weight(1f, fill = false)
                    .verticalScroll(rememberScrollState())
                    .padding(
                        start = TindivoSpacing.screen,
                        end = TindivoSpacing.screen,
                        bottom = TindivoSpacing.screen,
                    ),
        ) {
            TindivoTextButton(
                text = stringResource(R.string.courier_sheet_pin),
                onClick = { openSheet(CourierSheet.PinOnMap(end)) },
            )
            SheetSubtitle(stringResource(R.string.courier_sheet_saved))
            if (state.addresses.isEmpty()) {
                Text(
                    text = stringResource(R.string.courier_sheet_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            val noLocation = stringResource(R.string.courier_sheet_no_location)
            state.addresses.forEach { address ->
                ChoiceRow(
                    selected = false,
                    enabled = address.hasLocation,
                    title = address.label,
                    hint = if (address.hasLocation) address.line else noLocation,
                    onClick = { onPickAddress(address.id) },
                )
            }
            TindivoTextButton(
                text = stringResource(R.string.courier_sheet_add),
                onClick = { openSheet(CourierSheet.AddAddress(end)) },
            )
            if (state.contacts.isNotEmpty()) {
                SheetSubtitle(stringResource(R.string.courier_sheet_recent))
                state.contacts.forEachIndexed { index, contact ->
                    ChoiceRow(
                        selected = false,
                        enabled = true,
                        title = contact.name.ifBlank { contact.referenceText },
                        hint = contact.referenceText.takeIf { contact.name.isNotBlank() },
                        onClick = { onPickContact(index) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SheetSubtitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.padding(top = TindivoSpacing.item).semantics { heading() },
    )
}

/**
 * Marcar el punto en el mapa con el pin fijo al centro y escribir cómo llegar (web: el `pin-drop`). Solo se confirma
 * un punto que la persona movió dentro de la zona y con una referencia de 5 a 140 letras; el ViewModel lo vuelve a
 * comprobar y el servidor también. Lo escrito vive solo mientras la hoja está abierta.
 */
@Composable
private fun PinSheet(
    state: CourierRequestUiState,
    end: CourierEnd,
    onClose: () -> Unit,
    onConfirm: (GeoPoint, String) -> Unit,
) {
    val current = state.draft.point(end)
    val start = remember(end) { current.geoPointOrNull() }
    var point by remember(end) { mutableStateOf(start) }
    var reference by remember(end) { mutableStateOf(current.reference) }
    val inside = point?.let(state.area::contains) == true
    val referenceOk = reference.trim().length in COURIER_REFERENCE_MIN..COURIER_REFERENCE_MAX
    SheetFrame(title = stringResource(end.chooseTitle()), onClose = onClose, holdsMap = true) {
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            AddressMap(
                area = state.area,
                point = point,
                onPointChosen = { point = it },
                modifier = Modifier.matchParentSize(),
            )
        }
        Column(
            modifier = Modifier.navigationBarsPadding().padding(TindivoSpacing.screen),
            verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight),
        ) {
            PinStatus(point = point, inside = inside)
            OutlinedTextField(
                value = reference,
                onValueChange = { reference = it.take(COURIER_REFERENCE_MAX) },
                label = { Text(stringResource(R.string.courier_reference_label)) },
                placeholder = { Text(stringResource(end.referencePlaceholder())) },
                supportingText = { Text(stringResource(R.string.courier_pin_hint)) },
                modifier = Modifier.fillMaxWidth(),
            )
            TindivoPrimaryButton(
                text = stringResource(end.confirmLabel()),
                onClick = { point?.let { onConfirm(it, reference) } },
                enabled = inside && referenceOk,
            )
        }
    }
}

@Composable
private fun PinStatus(
    point: GeoPoint?,
    inside: Boolean,
) {
    val (text, color) =
        when {
            point == null -> R.string.courier_pin_move to MaterialTheme.colorScheme.onSurfaceVariant
            !inside -> R.string.courier_pin_outside to MaterialTheme.colorScheme.error
            else -> R.string.courier_pin_inside to MaterialTheme.colorScheme.tertiary
        }
    Text(text = stringResource(text), style = MaterialTheme.typography.bodyMedium, color = color)
}

private fun CourierPointDraft.geoPointOrNull(): GeoPoint? {
    val latitude = lat ?: return null
    val longitude = lng ?: return null
    return GeoPoint(latitude.toDouble(), longitude.toDouble())
}

private fun CourierEnd.chooseTitle(): Int =
    if (this == CourierEnd.Origin) R.string.courier_sheet_choose_origin else R.string.courier_sheet_choose_destination

private fun CourierEnd.confirmLabel(): Int =
    if (this == CourierEnd.Origin) R.string.courier_pin_confirm_origin else R.string.courier_pin_confirm_destination

private fun CourierEnd.referencePlaceholder(): Int =
    if (this == CourierEnd.Origin) R.string.courier_pin_reference_origin else R.string.courier_pin_reference_destination
