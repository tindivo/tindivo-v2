package com.tindivo.customer.feature.phone

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import com.tindivo.customer.support.SupportViewModel
import com.tindivo.customer.support.generalHelpLink
import com.tindivo.customer.support.openSafely
import com.tindivo.customer.ui.fields.OtpCodeField
import com.tindivo.customer.ui.fields.PhoneField
import com.tindivo.customer.ui.fields.formatPePhone
import com.tindivo.customer.ui.fields.resendClock

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
internal fun PhoneVerifyDestination(
    onBack: () -> Unit,
    onDone: () -> Unit,
    viewModel: PhoneVerifyViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(state.loggedOut) {
        if (state.loggedOut) onBack()
    }
    PhoneVerifyScreen(
        state = state,
        actions =
            PhoneActions(
                onPhoneChanged = viewModel::onPhoneChanged,
                onCodeChanged = viewModel::onCodeTyped,
                onSendCode = viewModel::sendCode,
                onVerify = viewModel::verify,
                onResend = viewModel::resend,
                onChangeNumber = viewModel::changeNumber,
                onConfirmTransfer = viewModel::confirmTransfer,
                onDismissTransfer = viewModel::dismissTransfer,
                onBack = onBack,
                onDone = onDone,
            ),
    )
}

internal class PhoneActions(
    val onPhoneChanged: (String) -> Unit,
    val onCodeChanged: (String) -> Unit,
    val onSendCode: () -> Unit,
    val onVerify: () -> Unit,
    val onResend: () -> Unit,
    val onChangeNumber: () -> Unit,
    val onConfirmTransfer: () -> Unit,
    val onDismissTransfer: () -> Unit,
    val onBack: () -> Unit,
    val onDone: () -> Unit,
)

@Composable
internal fun PhoneVerifyScreen(
    state: PhoneUiState,
    actions: PhoneActions,
) {
    Scaffold { innerPadding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            TextButton(onClick = actions.onBack, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.phone_back))
            }
            Text(
                text = stringResource(R.string.phone_title),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
            PhoneVerifyContent(state, actions)
        }
    }
}

/**
 * Los pasos del SMS sin marco (número, código, listo) y el aviso de traslado. Lo usan la pantalla de Mi cuenta y la
 * hoja del checkout, cada una con su título y su forma de cerrar.
 */
@Composable
internal fun PhoneVerifyContent(
    state: PhoneUiState,
    actions: PhoneActions,
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        when (state.step) {
            PhoneStep.Number -> NumberStep(state, actions)
            PhoneStep.Code -> CodeStep(state, actions)
            PhoneStep.Done -> DoneStep(state, actions)
        }
    }
    if (state.transfer != null) TransferDialog(sending = state.sending, actions = actions)
}

@Composable
private fun NumberStep(
    state: PhoneUiState,
    actions: PhoneActions,
) {
    // Tocar «Enviar código» con el número incompleto enseña el error del campo.
    var tried by rememberSaveable { mutableStateOf(false) }
    val send = {
        tried = true
        if (!state.sending) actions.onSendCode()
    }
    Text(text = stringResource(R.string.phone_number_hint), style = MaterialTheme.typography.bodyLarge)
    PhoneField(
        value = state.phone,
        onValueChange = actions.onPhoneChanged,
        label = stringResource(R.string.phone_number_label),
        submitted = tried,
        imeAction = ImeAction.Done,
        onImeAction = send,
        autoFocus = true,
    )
    ErrorLine(state.error, actions)
    ActionButton(
        text = stringResource(if (state.sending) R.string.phone_sending else R.string.phone_send_code),
        enabled = !state.sending,
        onClick = send,
    )
}

@Composable
private fun CodeStep(
    state: PhoneUiState,
    actions: PhoneActions,
) {
    // «Cambiar número» va junto al número al que se mandó el código.
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.phone_code_sent, formatPePhone(state.phone)),
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f),
        )
        TindivoTextButton(
            text = stringResource(R.string.phone_change_number),
            onClick = actions.onChangeNumber,
            enabled = !state.sending,
        )
    }
    // Al sexto dígito el ViewModel verifica solo (CUS-AUT-024); «Verificar» queda para quien prefiera tocarlo.
    OtpCodeField(
        value = state.code,
        onValueChange = actions.onCodeChanged,
        label = stringResource(R.string.phone_code_label),
        enabled = !state.sending,
        isError = state.error != null,
    )
    ErrorLine(state.error, actions)
    ActionButton(
        text = stringResource(if (state.sending) R.string.phone_sending else R.string.phone_verify),
        enabled = !state.sending,
        onClick = actions.onVerify,
    )
    val waiting = state.resendSeconds > 0
    TindivoTextButton(
        text =
            if (waiting) {
                stringResource(R.string.phone_resend_in, resendClock(state.resendSeconds))
            } else {
                stringResource(R.string.phone_resend)
            },
        onClick = actions.onResend,
        enabled = !state.sending && !waiting,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun DoneStep(
    state: PhoneUiState,
    actions: PhoneActions,
) {
    Text(
        text = stringResource(R.string.phone_done_title),
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
    Text(
        text = stringResource(R.string.phone_done_message, state.verifiedPhone.orEmpty()),
        style = MaterialTheme.typography.bodyLarge,
    )
    ActionButton(text = stringResource(R.string.phone_done_close), enabled = true, onClick = actions.onDone)
}

@Composable
private fun TransferDialog(
    sending: Boolean,
    actions: PhoneActions,
) {
    AlertDialog(
        onDismissRequest = actions.onDismissTransfer,
        title = { Text(text = stringResource(R.string.phone_transfer_title)) },
        text = { Text(text = stringResource(R.string.phone_transfer_message)) },
        confirmButton = {
            Button(
                onClick = actions.onConfirmTransfer,
                enabled = !sending,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(text = stringResource(R.string.phone_transfer_confirm))
            }
        },
        dismissButton = {
            TextButton(
                onClick = actions.onDismissTransfer,
                enabled = !sending,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(text = stringResource(R.string.phone_transfer_cancel))
            }
        },
    )
}

@Composable
private fun ActionButton(
    text: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    // El único primario de la hoja: 56 dp, abajo del formulario.
    TindivoPrimaryButton(text = text, onClick = onClick, enabled = enabled)
}

@Composable
private fun ErrorLine(
    error: PhoneError?,
    actions: PhoneActions,
) {
    if (error == null) return
    if (error == PhoneError.OtherAccount) {
        OtherAccountNotice(actions)
        return
    }
    val text =
        when (error) {
            is PhoneError.Server -> error.text
            PhoneError.InvalidNumber -> stringResource(R.string.phone_error_number)
            PhoneError.InvalidCode -> stringResource(R.string.phone_error_code)
            PhoneError.ChallengeExpired -> stringResource(R.string.phone_error_expired)
            PhoneError.OtherAccount -> stringResource(R.string.phone_other_account)
            PhoneError.Network -> stringResource(R.string.error_network)
            PhoneError.Generic -> stringResource(R.string.error_generic)
        }
    Text(
        text = text,
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}

/** El celular es de otra cuenta: no se traslada; se escribe a soporte por WhatsApp o se prueba otro número. */
@Composable
private fun OtherAccountNotice(
    actions: PhoneActions,
    supportViewModel: SupportViewModel = hiltViewModel(),
) {
    val uriHandler = LocalUriHandler.current
    val number = supportViewModel.number.collectAsStateWithLifecycle().value
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.phone_other_account),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        ActionButton(
            text = stringResource(R.string.phone_contact_support),
            enabled = true,
            onClick = { uriHandler.openSafely(generalHelpLink(number)) },
        )
        TextButton(onClick = actions.onChangeNumber, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(text = stringResource(R.string.phone_use_other_number))
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun PhoneNumberPreview() {
    TindivoTheme {
        PhoneVerifyScreen(state = PhoneUiState(phone = "987654"), actions = previewActions())
    }
}

@Preview(showBackground = true)
@Composable
private fun PhoneCodePreview() {
    TindivoTheme {
        PhoneVerifyScreen(
            state = PhoneUiState(step = PhoneStep.Code, phone = "987654321", code = "12", resendSeconds = 42),
            actions = previewActions(),
        )
    }
}

private fun previewActions() =
    PhoneActions(
        onPhoneChanged = {},
        onCodeChanged = {},
        onSendCode = {},
        onVerify = {},
        onResend = {},
        onChangeNumber = {},
        onConfirmTransfer = {},
        onDismissTransfer = {},
        onBack = {},
        onDone = {},
    )
