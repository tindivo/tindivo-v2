package com.tindivo.customer.feature.orders

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.tindivo.customer.R

/**
 * «Paga tu pedido»: cuánto y a quién pagar, el tiempo que queda y la subida de la captura. [amount] es el total del
 * pedido tal como lo mandó el servidor, ya con «S/»: la app no calcula ningún importe.
 */
@Composable
internal fun PrepaySection(
    state: PrepayUiState,
    amount: String,
    actions: PrepayActions,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = stringResource(R.string.prepay_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { heading() },
            )
            when (val info = state.info) {
                PrepayInfoState.Idle, PrepayInfoState.Loading -> {
                    OrdersLoading()
                }

                is PrepayInfoState.Failed -> {
                    Text(text = stringResource(R.string.prepay_info_error), style = MaterialTheme.typography.bodyLarge)
                    OutlinedButton(onClick = actions.retryInfo, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(text = stringResource(R.string.prepay_retry))
                    }
                }

                // El detalle se vuelve a consultar solo y dirá en qué quedó el pedido.
                PrepayInfoState.NotAwaiting -> {
                    Text(
                        text = stringResource(R.string.prepay_not_awaiting),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }

                is PrepayInfoState.Ready -> {
                    ReadyContent(state = state, details = info.details, amount = amount, actions = actions)
                }
            }
        }
    }
}

@Composable
private fun ReadyContent(
    state: PrepayUiState,
    details: PrepayDetails,
    amount: String,
    actions: PrepayActions,
) {
    val business = details.businessName.ifBlank { stringResource(R.string.order_business_fallback) }
    Text(text = stringResource(R.string.prepay_confirmed, business), style = MaterialTheme.typography.bodyLarge)
    if (details.lastTry) {
        Text(
            text = stringResource(R.string.prepay_last_try),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
    }
    state.countdown?.let { CountdownLine(countdown = it) }
    PrepayPayeeCard(amount = amount, payee = details.payee)
    if (state.send is SendState.Sent) {
        SentNotice()
    } else if (state.countdown != PrepayCountdown.Expired) {
        ProofPicker(state = state, actions = actions)
    }
}

@Composable
private fun CountdownLine(countdown: PrepayCountdown) {
    val live = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
    when (countdown) {
        is PrepayCountdown.Remaining -> {
            val minutes = countdown.minutes.toInt()
            Text(
                text = pluralStringResource(R.plurals.prepay_time_left, minutes, minutes),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = live,
            )
        }

        PrepayCountdown.Expired -> {
            Column(modifier = live) {
                Text(
                    text = stringResource(R.string.prepay_expired_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.error,
                )
                Text(text = stringResource(R.string.prepay_expired_body), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
internal fun SentNotice() {
    Text(
        text = stringResource(R.string.prepay_sent),
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}

/** Elegir la captura con el selector de fotos del sistema (sin permisos), verla, cambiarla y enviarla. */
@Composable
private fun ProofPicker(
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
    if (photo == null) {
        Button(onClick = pick, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text(text = stringResource(R.string.prepay_upload))
        }
        Text(
            text = stringResource(R.string.prepay_upload_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    } else {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                text = stringResource(R.string.prepay_preview_title),
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f),
            )
            OutlinedButton(onClick = pick, enabled = !sending, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.prepay_change))
            }
        }
        AsyncImage(
            model = photo,
            contentDescription = stringResource(R.string.prepay_preview_description),
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxWidth().heightIn(max = 240.dp).clip(RoundedCornerShape(12.dp)),
        )
        Button(
            onClick = actions.send,
            enabled = state.canSend,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        ) {
            if (sending) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                Text(
                    text = stringResource(R.string.prepay_sending),
                    modifier = Modifier.padding(start = 8.dp).semantics { liveRegion = LiveRegionMode.Polite },
                )
            } else {
                Text(text = stringResource(R.string.prepay_send))
            }
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

        SendProblem.Unreadable, SendProblem.TooLarge -> {
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
