package com.tindivo.customer.feature.orders

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.customer.R
import com.tindivo.customer.ui.NumberedStep

/** Elegir la captura con el selector de fotos del sistema (sin permisos), verla, cambiarla y enviarla. */
@Composable
internal fun ProofPicker(
    state: PrepayUiState,
    actions: PrepayActions,
) {
    val picker =
        rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            actions.onPhotoPicked(uri?.toString())
        }
    val pick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    val sending = state.send is SendState.Sending
    val photo = state.photo
    NumberedStep(number = 3) {
        Text(text = stringResource(R.string.prepay_step_upload), style = MaterialTheme.typography.titleMedium)
        if (photo == null) {
            TindivoPrimaryButton(text = stringResource(R.string.prepay_upload), onClick = pick)
            Text(
                text = stringResource(R.string.prepay_upload_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            AsyncImage(
                model = photo,
                contentDescription = stringResource(R.string.prepay_preview_description),
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxWidth().heightIn(max = 240.dp).clip(RoundedCornerShape(12.dp)),
            )
            // «Cambiar» es una salida, no la acción: texto bajo la imagen, sin competir con «Enviar comprobante».
            TindivoTextButton(text = stringResource(R.string.prepay_change), onClick = pick, enabled = !sending)
        }
        // Quién verá la captura (CUS-PAY-015): siempre a la vista, encima de «Enviar comprobante» (CA-PAY-P8).
        Text(
            text = stringResource(R.string.prepay_proof_notice),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        // Sin foto «Enviar» se ve apagado y dice por qué (CA-PAY-P4).
        TindivoPrimaryButton(
            text = stringResource(if (sending) R.string.prepay_sending else R.string.prepay_send),
            onClick = actions.send,
            enabled = state.canSend,
            loading = sending,
        )
        if (photo == null) {
            Text(
                text = stringResource(R.string.prepay_send_needs_photo),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    (state.send as? SendState.Failed)?.let { SendFailure(problem = it.problem, onRetry = actions.send, onPick = pick) }
}

@Composable
private fun SendFailure(
    problem: SendProblem,
    onRetry: () -> Unit,
    onPick: () -> Unit,
) {
    val message =
        when (problem) {
            SendProblem.Offline -> stringResource(R.string.prepay_error_offline)
            SendProblem.Unreadable -> stringResource(R.string.prepay_error_unreadable)
            SendProblem.TooLarge -> stringResource(R.string.prepay_error_too_large)
            SendProblem.HeicUnsupported -> stringResource(R.string.prepay_error_heic)
            is SendProblem.Rejected -> problem.detail ?: stringResource(R.string.prepay_error_generic)
            SendProblem.Generic -> stringResource(R.string.prepay_error_generic)
        }
    Text(
        text = message,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.error,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
    )
    when (problem) {
        SendProblem.Offline, SendProblem.Generic -> {
            OutlinedButton(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.prepay_retry))
            }
        }

        SendProblem.Unreadable, SendProblem.TooLarge, SendProblem.HeicUnsupported -> {
            OutlinedButton(onClick = onPick, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.prepay_pick_other))
            }
        }

        // Lo que dijo el servidor ya explica qué hacer; el detalle se vuelve a consultar solo.
        is SendProblem.Rejected -> {
            Unit
        }
    }
}
