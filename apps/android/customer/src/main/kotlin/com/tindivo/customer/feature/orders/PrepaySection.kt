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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.customer.R
import com.tindivo.customer.ui.NumberedStep

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
            PrepayTitle(state)
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
                    if (info.details.optional) {
                        OptionalContent(state = state, details = info.details, amount = amount, actions = actions)
                    } else {
                        ReadyContent(state = state, details = info.details, amount = amount, actions = actions)
                    }
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
    if (details.lastTry) LastTryNotice()
    // «Te quedan N min» va fija arriba de la pantalla (PrepayCountdownPill); aquí solo se avisa si ya venció.
    if (state.countdown == PrepayCountdown.Expired) ExpiredNotice()
    PrepayPayeeCard(amount = amount, payee = details.payee)
    if (state.send is SendState.Sent) {
        SentNotice()
    } else if (state.showsProofPicker) {
        ProofPicker(state = state, actions = actions)
    }
}

/** El título: «Paga tu pedido», o, en el pago opcional, «Paga a <negocio>» con «Con Yape o Plin» debajo. */
@Composable
private fun PrepayTitle(state: PrepayUiState) {
    val details = (state.info as? PrepayInfoState.Ready)?.details?.takeIf { it.optional }
    if (details == null) {
        Text(
            text = stringResource(R.string.prepay_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        return
    }
    val business = details.businessName.ifBlank { stringResource(R.string.order_business_fallback) }
    Column {
        Text(
            text = stringResource(R.string.prepay_title_business, business),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(R.string.prepay_with_wallets),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Ya se rechazó un comprobante y queda un solo intento. */
@Composable
internal fun LastTryNotice() {
    Text(
        text = stringResource(R.string.prepay_last_try),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.error,
    )
}

/**
 * La pastilla fija de arriba: «Te quedan N min», en rojo cuando se ve menos de 3. Vive fuera del desplazamiento del
 * detalle (ver `OrderBody`) para que se vea con el comprobante a medio subir. Vencido no se pinta: sale su aviso.
 */
@Composable
internal fun PrepayCountdownPill(countdown: PrepayCountdown) {
    val remaining = countdown as? PrepayCountdown.Remaining ?: return
    val minutes = remaining.minutes.toInt()
    val scheme = MaterialTheme.colorScheme
    val urgent = countdown.isUrgent
    Surface(
        color = if (urgent) scheme.errorContainer else scheme.surfaceContainerHigh,
        contentColor = if (urgent) scheme.onErrorContainer else scheme.onSurface,
        shape = CircleShape,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Text(
            text = pluralStringResource(R.plurals.prepay_time_left, minutes, minutes),
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun ExpiredNotice() {
    Column(modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
        Text(
            text = stringResource(R.string.prepay_expired_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.error,
        )
        Text(text = stringResource(R.string.prepay_expired_body), style = MaterialTheme.typography.bodyMedium)
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
