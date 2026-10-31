package com.tindivo.customer.feature.phone

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R

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
                onCodeChanged = viewModel::onCodeChanged,
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
            when (state.step) {
                PhoneStep.Number -> NumberStep(state, actions)
                PhoneStep.Code -> CodeStep(state, actions)
                PhoneStep.Done -> DoneStep(state, actions)
            }
        }
    }
    if (state.transfer != null) TransferDialog(sending = state.sending, actions = actions)
}

@Composable
private fun NumberStep(
    state: PhoneUiState,
    actions: PhoneActions,
) {
    Text(text = stringResource(R.string.phone_number_hint), style = MaterialTheme.typography.bodyLarge)
    OutlinedTextField(
        value = state.phone,
        onValueChange = actions.onPhoneChanged,
        label = { Text(text = stringResource(R.string.phone_number_label)) },
        prefix = { Text(text = stringResource(R.string.phone_prefix)) },
        singleLine = true,
        isError = state.error != null,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = Modifier.fillMaxWidth(),
    )
    ErrorLine(state.error)
    ActionButton(
        text = stringResource(if (state.sending) R.string.phone_sending else R.string.phone_send_code),
        enabled = !state.sending,
        onClick = actions.onSendCode,
    )
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
private fun CodeStep(
    state: PhoneUiState,
    actions: PhoneActions,
) {
    Text(
        text = stringResource(R.string.phone_code_sent, state.phone),
        style = MaterialTheme.typography.bodyLarge,
    )
    OutlinedTextField(
        value = state.code,
        onValueChange = actions.onCodeChanged,
        label = { Text(text = stringResource(R.string.phone_code_label)) },
        singleLine = true,
        isError = state.error != null,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = Modifier.fillMaxWidth().semantics { contentType = ContentType.SmsOtpCode },
    )
    ErrorLine(state.error)
    ActionButton(
        text = stringResource(if (state.sending) R.string.phone_sending else R.string.phone_verify),
        enabled = !state.sending,
        onClick = actions.onVerify,
    )
    OutlinedButton(
        onClick = actions.onResend,
        enabled = !state.sending && state.resendSeconds <= 0,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
    ) {
        Text(text = stringResource(R.string.phone_resend))
    }
    if (state.resendSeconds > 0) {
        Text(
            text = stringResource(R.string.phone_resend_wait, state.resendSeconds),
            style = MaterialTheme.typography.bodyMedium,
        )
    }
    TextButton(
        onClick = actions.onChangeNumber,
        enabled = !state.sending,
        modifier = Modifier.heightIn(min = 48.dp),
    ) {
        Text(text = stringResource(R.string.phone_change_number))
    }
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
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
    ) {
        Text(text = text)
    }
}

@Composable
private fun ErrorLine(error: PhoneError?) {
    if (error == null) return
    val text =
        when (error) {
            is PhoneError.Server -> error.text
            PhoneError.InvalidNumber -> stringResource(R.string.phone_error_number)
            PhoneError.InvalidCode -> stringResource(R.string.phone_error_code)
            PhoneError.ChallengeExpired -> stringResource(R.string.phone_error_expired)
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
