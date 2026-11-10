package com.tindivo.customer.feature.checkout

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
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
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
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
import com.tindivo.customer.feature.SheetClose
import com.tindivo.customer.feature.addresses.AddressFormActions
import com.tindivo.customer.feature.addresses.AddressFormContent
import com.tindivo.customer.feature.addresses.AddressFormViewModel
import com.tindivo.customer.feature.addresses.FormOutcome
import com.tindivo.customer.feature.addresses.SaveBar
import com.tindivo.customer.feature.addresses.showsSaveBar
import com.tindivo.customer.feature.phone.PhoneActions
import com.tindivo.customer.feature.phone.PhoneStep
import com.tindivo.customer.feature.phone.PhoneVerified
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

/**
 * De dónde sale el ViewModel de cada hoja. En la app, de Hilt, guardado con la clave de la apertura; las pruebas de UI
 * proveen otro con [LocalCheckoutSheetModels] para armarlos a mano con dobles de red. No cambia nada más.
 */
internal interface CheckoutSheetModels {
    @Composable
    fun address(
        key: String,
        editingId: String?,
    ): AddressFormViewModel

    @Composable
    fun phone(key: String): PhoneVerifyViewModel

    @Composable
    fun profile(key: String): ProfileViewModel
}

private object HiltCheckoutSheetModels : CheckoutSheetModels {
    @Composable
    override fun address(
        key: String,
        editingId: String?,
    ): AddressFormViewModel =
        hiltViewModel<AddressFormViewModel, AddressFormViewModel.Factory>(
            key = key,
            creationCallback = { factory -> factory.create(editingId) },
        )

    @Composable
    override fun phone(key: String): PhoneVerifyViewModel = hiltViewModel(key = key)

    @Composable
    override fun profile(key: String): ProfileViewModel = hiltViewModel(key = key)
}

internal val LocalCheckoutSheetModels = staticCompositionLocalOf<CheckoutSheetModels> { HiltCheckoutSheetModels }

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
 * mapa no mueva la hoja. Se cierra con «Cerrar» o con atrás, salvo mientras guarda o borra: lo que el servidor
 * responda tiene que llegar al checkout.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddressSheet(
    editingId: String?,
    key: String,
    actions: CheckoutSheetActions,
) {
    val viewModel = LocalCheckoutSheetModels.current.address(key, editingId)
    val form = viewModel.state.collectAsStateWithLifecycle().value
    val deliver: (FormOutcome) -> Unit = { deliverAddress(it, actions) }
    // El guardado o el borrado sale por takeResult: una sola vez, aunque el cierre de la hoja llegue antes (CAX-005).
    LaunchedEffect(form.outcome) {
        when (form.outcome) {
            FormOutcome.LoggedOut -> actions.onClose()
            null -> Unit
            else -> viewModel.takeResult()?.let(deliver)
        }
    }
    val title = if (editingId == null) R.string.checkout_sheet_add_title else R.string.checkout_sheet_edit_title
    SheetFrame(
        title = stringResource(title),
        onClose = actions.onClose,
        busy = form.busy,
        closeIfIdle = { viewModel.closeIfIdle().deliverPending(deliver) },
        holdsMap = true,
    ) {
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
                        onLocationPermission = viewModel::onLocationPermission,
                        onStopLocating = viewModel::stopLocating,
                        onSave = viewModel::save,
                        onAskDelete = viewModel::askDelete,
                        onCancelDelete = viewModel::cancelDelete,
                        onConfirmDelete = viewModel::confirmDelete,
                        onRetry = viewModel::load,
                        onCancel = { if (viewModel.closeIfIdle().deliverPending(deliver)) actions.onClose() },
                    ),
            )
        }
        if (form.showsSaveBar) SaveBar(form, viewModel::save)
    }
}

private fun deliverAddress(
    outcome: FormOutcome,
    actions: CheckoutSheetActions,
) {
    when (outcome) {
        is FormOutcome.Saved -> actions.onAddressSaved(outcome.id)
        FormOutcome.Deleted -> actions.onAddressDeleted()
        FormOutcome.LoggedOut -> Unit
    }
}

/** Verificar el celular por SMS. Al quedar verificado, la hoja se cierra sola y el checkout relee el perfil. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PhoneSheet(
    key: String,
    actions: CheckoutSheetActions,
) {
    val viewModel = LocalCheckoutSheetModels.current.phone(key)
    DiscardOnLeave(viewModel::discardInput)
    val phone = viewModel.state.collectAsStateWithLifecycle().value
    val deliver: (PhoneVerified) -> Unit = { actions.onPhoneVerified() }
    // La verificación sale por takeResult: una sola vez, aunque el cierre de la hoja llegue antes (CAX-005).
    LaunchedEffect(phone.step, phone.loggedOut) {
        when {
            phone.loggedOut -> actions.onClose()
            phone.step == PhoneStep.Done -> viewModel.takeResult()?.let(deliver)
        }
    }
    val closeNow: () -> Unit = { if (viewModel.closeIfIdle().deliverPending(deliver)) actions.onClose() }
    SheetFrame(
        title = stringResource(R.string.checkout_sheet_phone_title),
        onClose = actions.onClose,
        busy = phone.sending,
        closeIfIdle = { viewModel.closeIfIdle().deliverPending(deliver) },
    ) {
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
                        onBack = closeNow,
                        // «Cerrar» tras verificar: entrega la verificación si nadie la entregó y retira la hoja.
                        onDone = closeNow,
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
    val viewModel = LocalCheckoutSheetModels.current.profile(key)
    DiscardOnLeave(viewModel::discardInput)
    val profile = viewModel.state.collectAsStateWithLifecycle().value
    val deliver: (ProfileOutcome) -> Unit = { actions.onProfileCompleted() }
    // El nombre guardado sale por takeResult: una sola vez, aunque el cierre de la hoja llegue antes (CAX-005).
    LaunchedEffect(profile.outcome) {
        when (profile.outcome) {
            ProfileOutcome.Saved -> viewModel.takeResult()?.let(deliver)
            ProfileOutcome.Left -> actions.onClose()
            null -> Unit
        }
    }
    SheetFrame(
        title = stringResource(R.string.checkout_sheet_profile_title),
        onClose = actions.onClose,
        busy = profile.saving,
        closeIfIdle = { viewModel.closeIfIdle().deliverPending(deliver) },
    ) {
        ScrollingBody {
            ProfileContent(state = profile, onName = viewModel::onName, onSave = viewModel::save)
        }
    }
}

/**
 * El ViewModel de la hoja vive en el del checkout hasta que el checkout sale de la pila: al salir la hoja de la
 * composición, [discard] borra lo escrito (datos personales). Girar la pantalla no cuenta: rehace la composición con el
 * mismo ViewModel y la hoja sigue abierta con lo que tenía.
 */
@Composable
private fun DiscardOnLeave(discard: () -> Unit) {
    val activity = LocalActivity.current
    val latest = rememberUpdatedState(discard)
    DisposableEffect(Unit) {
        onDispose { if (activity?.isChangingConfigurations != true) latest.value() }
    }
}

/**
 * Lo que la hoja hace con la respuesta de su ViewModel al pedir cerrarse: con [SheetClose.Busy] no se retira; con
 * [SheetClose.Close] entrega PRIMERO el éxito que quedaba pendiente (si lo hay) y dice que ya se puede retirar. Así ni
 * el orden entre el efecto y el cierre pierde el dato ni lo entrega dos veces (CAX-005).
 */
internal fun <T : Any> SheetClose<T>.deliverPending(deliver: (T) -> Unit): Boolean =
    when (this) {
        SheetClose.Busy -> {
            false
        }

        is SheetClose.Close -> {
            pending?.let(deliver)
            true
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
 * La hoja puede esconderse salvo que [busy]: con un guardado, un borrado o un código en vuelo, la respuesta tiene que
 * llegar al checkout, así que ni arrastrar, ni tocar fuera, ni atrás la cierran.
 */
@OptIn(ExperimentalMaterial3Api::class)
internal fun sheetMayMoveTo(
    target: SheetValue,
    busy: Boolean,
): Boolean = target != SheetValue.Hidden || !busy

/**
 * El marco común: título (encabezado para TalkBack) y «Cerrar» de 48 dp. Atrás, arrastrar y tocar fuera también
 * cierran, salvo con [busy] (ver [sheetMayMoveTo]): entonces «Cerrar» queda deshabilitado y atrás no hace nada. Con
 * [holdsMap] la hoja ocupa toda la altura, no se arrastra ni muestra el asa: el gesto es del mapa.
 *
 * [busy] llega con la recomposición, un cuadro tarde: un guardado puede empezar mientras la hoja se esconde, o entre
 * el toque y la recomposición. Por eso la hoja, ya escondida, solo se retira si [closeIfIdle] (el ViewModel, leído en
 * ese momento) lo permite; si no, vuelve a mostrarse y lo que responda el servidor llega al checkout. Si lo permite,
 * [closeIfIdle] ya entregó el resultado que terminó durante el cierre y que el efecto de la hoja aún no había
 * entregado ([deliverPending]): solo después se llama a [onClose]. Un cierre cancelado (la hoja salió de la
 * composición por otra causa) no retira nada (CAX-005).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SheetFrame(
    title: String,
    onClose: () -> Unit,
    busy: Boolean = false,
    closeIfIdle: () -> Boolean = { true },
    holdsMap: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val busyNow = rememberUpdatedState(busy)
    // Estable entre recomposiciones: el estado de la hoja se recuerda con esta función como clave.
    val mayMove = remember { { target: SheetValue -> sheetMayMoveTo(target, busyNow.value) } }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = mayMove)
    val scope = rememberCoroutineScope()
    val latestClose = rememberUpdatedState(onClose)
    val latestCloseIfIdle = rememberUpdatedState(closeIfIdle)
    val settle: () -> Unit = {
        if (latestCloseIfIdle.value()) latestClose.value() else scope.launch { sheetState.show() }
    }
    val close: () -> Unit = {
        if (!busyNow.value) {
            scope.launch {
                sheetState.hide()
                settle()
            }
        }
    }
    ModalBottomSheet(
        onDismissRequest = settle,
        sheetState = sheetState,
        sheetGesturesEnabled = !holdsMap,
        dragHandle = if (holdsMap) null else ({ BottomSheetDefaults.DragHandle() }),
    ) {
        BackHandler(enabled = busy) {}
        Column(
            modifier = (if (holdsMap) Modifier.fillMaxSize() else Modifier.fillMaxWidth()).imePadding(),
        ) {
            SheetHeader(title = title, onClose = close, enabled = !busy, topPadding = if (holdsMap) 16.dp else 0.dp)
            content()
        }
    }
}

@Composable
private fun SheetHeader(
    title: String,
    onClose: () -> Unit,
    enabled: Boolean,
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
        IconButton(onClick = onClose, enabled = enabled, modifier = Modifier.size(48.dp)) {
            Icon(TindivoIcons.Close, contentDescription = stringResource(R.string.checkout_sheet_close))
        }
    }
}
