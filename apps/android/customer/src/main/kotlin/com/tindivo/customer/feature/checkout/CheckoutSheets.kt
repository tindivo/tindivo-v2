package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.customer.R
import com.tindivo.customer.feature.addresses.AddressFormActions
import com.tindivo.customer.feature.addresses.AddressFormContent
import com.tindivo.customer.feature.addresses.AddressFormViewModel
import com.tindivo.customer.feature.addresses.FormOutcome
import com.tindivo.customer.feature.addresses.SaveBar
import com.tindivo.customer.feature.addresses.showsSaveBar
import com.tindivo.customer.feature.phone.PhoneActions
import com.tindivo.customer.feature.phone.PhoneStep
import com.tindivo.customer.feature.phone.PhoneVerifyContent
import com.tindivo.customer.feature.phone.PhoneVerifyViewModel
import com.tindivo.customer.feature.profile.ProfileContent
import com.tindivo.customer.feature.profile.ProfileOutcome
import com.tindivo.customer.feature.profile.ProfileViewModel
import kotlinx.coroutines.launch

/**
 * La hoja abierta encima del checkout, si la hay y si el checkout sigue en su fase. Cada una reusa el cuerpo y el
 * ViewModel de su pantalla de Mi cuenta; [opening] (cuenta las aperturas) es la clave de ese ViewModel, para que
 * reabrir la hoja no herede el estado de la vez anterior. Al terminar, la hoja avisa por [actions] y el checkout aplica
 * el dato; cerrarla sin terminar no aplica nada.
 */
@Composable
internal fun CheckoutSheetHost(
    state: CheckoutUiState,
    actions: CheckoutSheetActions,
    openSheet: (CheckoutSheet) -> Unit,
    opening: Int,
) {
    val sheet = state.sheet ?: return
    if (state.phase != sheet.phase) return
    val key = "checkout-sheet-$opening"
    when (sheet) {
        CheckoutSheet.ChooseAddress -> ChooseAddressSheet(state, actions) { openSheet(CheckoutSheet.AddAddress) }
        CheckoutSheet.AddAddress -> AddressSheet(editingId = null, key = key, actions = actions)
        is CheckoutSheet.EditAddress -> AddressSheet(editingId = sheet.id, key = key, actions = actions)
        CheckoutSheet.VerifyPhone -> PhoneSheet(key, actions)
        CheckoutSheet.CompleteProfile -> ProfileSheet(key, actions)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChooseAddressSheet(
    state: CheckoutUiState,
    actions: CheckoutSheetActions,
    onAddNew: () -> Unit,
) {
    SheetFrame(title = stringResource(R.string.checkout_sheet_choose_title), onClose = actions.onClose) {
        Column(
            modifier =
                Modifier
                    .weight(1f, fill = false)
                    .verticalScroll(rememberScrollState())
                    .padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
        ) {
            state.addresses.forEach { address ->
                ChoiceRow(
                    selected = address.id == state.selectedAddressId,
                    enabled = true,
                    title = address.label,
                    hint = address.line,
                    onClick = { actions.onPickAddress(address.id) },
                )
            }
            TextButton(onClick = onAddNew, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.checkout_sheet_add_new))
            }
        }
    }
}

/**
 * Alta o corrección de una dirección, con el mapa dentro: abre a altura completa y sin arrastre, para que mover el
 * mapa no mueva la hoja. Se cierra con «Cerrar» o con atrás.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddressSheet(
    editingId: String?,
    key: String,
    actions: CheckoutSheetActions,
) {
    val viewModel =
        hiltViewModel<AddressFormViewModel, AddressFormViewModel.Factory>(
            key = key,
            creationCallback = { factory -> factory.create(editingId) },
        )
    val form = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(form.outcome) {
        when (val outcome = form.outcome) {
            is FormOutcome.Saved -> actions.onAddressSaved(outcome.id)
            FormOutcome.Deleted -> actions.onAddressDeleted()
            FormOutcome.LoggedOut -> actions.onClose()
            null -> Unit
        }
    }
    val title = if (editingId == null) R.string.checkout_sheet_add_title else R.string.checkout_sheet_edit_title
    SheetFrame(title = stringResource(title), onClose = actions.onClose, holdsMap = true) {
        Box(modifier = Modifier.weight(1f).padding(horizontal = 16.dp)) {
            AddressFormContent(
                state = form,
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
                        onCancel = actions.onClose,
                    ),
            )
        }
        if (form.showsSaveBar) SaveBar(form, viewModel::save)
    }
}

/** Verificar el celular por SMS. Al quedar verificado, la hoja se cierra sola y el checkout relee el perfil. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PhoneSheet(
    key: String,
    actions: CheckoutSheetActions,
) {
    val viewModel = hiltViewModel<PhoneVerifyViewModel>(key = key)
    val phone = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(phone.step, phone.loggedOut) {
        when {
            phone.loggedOut -> actions.onClose()
            phone.step == PhoneStep.Done -> actions.onPhoneVerified()
        }
    }
    SheetFrame(title = stringResource(R.string.checkout_sheet_phone_title), onClose = actions.onClose) {
        ScrollingBody {
            PhoneVerifyContent(
                state = phone,
                actions =
                    PhoneActions(
                        onPhoneChanged = viewModel::onPhoneChanged,
                        onCodeChanged = viewModel::onCodeChanged,
                        onSendCode = viewModel::sendCode,
                        onVerify = viewModel::verify,
                        onResend = viewModel::resend,
                        onChangeNumber = viewModel::changeNumber,
                        onConfirmTransfer = viewModel::confirmTransfer,
                        onDismissTransfer = viewModel::dismissTransfer,
                        onBack = actions.onClose,
                        onDone = actions.onPhoneVerified,
                    ),
            )
        }
    }
}

/** El nombre de una cuenta sin perfil. Al guardarlo, la hoja se cierra y el checkout se carga. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileSheet(
    key: String,
    actions: CheckoutSheetActions,
) {
    val viewModel = hiltViewModel<ProfileViewModel>(key = key)
    val profile = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(profile.outcome) {
        when (profile.outcome) {
            ProfileOutcome.Saved -> actions.onProfileCompleted()
            ProfileOutcome.Left -> actions.onClose()
            null -> Unit
        }
    }
    SheetFrame(title = stringResource(R.string.checkout_sheet_profile_title), onClose = actions.onClose) {
        ScrollingBody {
            ProfileContent(state = profile, onName = viewModel::onName, onSave = viewModel::save)
        }
    }
}

@Composable
private fun ColumnScope.ScrollingBody(content: @Composable () -> Unit) {
    Box(
        modifier =
            Modifier
                .weight(1f, fill = false)
                .verticalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
    ) {
        content()
    }
}

/**
 * El marco común: título (encabezado para TalkBack) y «Cerrar» de 48 dp. Atrás y tocar fuera también cierran. Con
 * [holdsMap] la hoja ocupa toda la altura, no se arrastra ni muestra el asa: el gesto es del mapa.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SheetFrame(
    title: String,
    onClose: () -> Unit,
    holdsMap: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val close: () -> Unit = { scope.launch { sheetState.hide() }.invokeOnCompletion { onClose() } }
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = sheetState,
        sheetGesturesEnabled = !holdsMap,
        dragHandle = if (holdsMap) null else ({ BottomSheetDefaults.DragHandle() }),
    ) {
        Column(
            modifier = (if (holdsMap) Modifier.fillMaxSize() else Modifier.fillMaxWidth()).imePadding(),
        ) {
            SheetHeader(title = title, onClose = close, topPadding = if (holdsMap) 16.dp else 0.dp)
            content()
        }
    }
}

@Composable
private fun SheetHeader(
    title: String,
    onClose: () -> Unit,
    topPadding: Dp,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = topPadding),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        IconButton(onClick = onClose, modifier = Modifier.size(48.dp)) {
            Icon(TindivoIcons.Close, contentDescription = stringResource(R.string.checkout_sheet_close))
        }
    }
}
