package com.tindivo.customer.feature.orders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R
import kotlinx.coroutines.delay
import java.time.Instant

private const val TICK_MILLIS = 1_000L

/** La hora de ahora, que avanza cada segundo mientras [active]; con [active] en falso se queda quieta. */
@Composable
private fun rememberNow(active: Boolean): State<Instant> =
    produceState(initialValue = Instant.now(), active) {
        while (active) {
            delay(TICK_MILLIS)
            value = Instant.now()
        }
    }

/** «Esperando que el negocio acepte» con la cuenta atrás del plazo (CUS-TRK-019, CUS-TRK-005). */
@Composable
internal fun AcceptanceWaitBlock(
    start: Instant?,
    acceptanceMinutes: Int?,
) {
    val now = rememberNow(active = true).value
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = stringResource(R.string.order_wait_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(text = stringResource(R.string.order_wait_status), style = MaterialTheme.typography.bodyLarge)
        // El plazo completo, como lo aprobó Jesús (CA-TRK-06); la cuenta atrás va aparte.
        if (acceptanceMinutes != null) {
            Text(
                text = stringResource(R.string.order_wait_respond, acceptanceMinutes),
                style = MaterialTheme.typography.bodyLarge,
            )
        }
        when (val clock = acceptanceClockOf(start, acceptanceMinutes, now)) {
            is AcceptanceClock.Running -> {
                Text(
                    text = stringResource(R.string.order_wait_left, clock.minutesLeft),
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (clock.urgent) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                )
            }

            AcceptanceClock.Overdue -> {
                Text(text = stringResource(R.string.order_wait_confirming), style = MaterialTheme.typography.bodyLarge)
            }

            null -> {
                Unit
            }
        }
    }
}

/** «Llega en 18–25 min»: siempre un rango, nunca una hora exacta (CUS-TRK-004). */
@Composable
internal fun EtaLine(order: OrderDetailUi) {
    val now = rememberNow(active = order.etaStage != EtaStage.Finished).value
    val atDoor = order.driver?.atDoor == true
    val eta = etaOf(order.etaStage, order.isPickup, atDoor, order.estimatedReadyAt, order.travel, now) ?: return
    val text =
        when (eta) {
            EtaView.Ready -> stringResource(R.string.order_eta_ready)
            EtaView.Anytime -> stringResource(R.string.order_eta_anytime)
            is EtaView.Single -> stringResource(R.string.order_eta_single, eta.minutes)
            is EtaView.Range -> stringResource(R.string.order_eta_range, eta.min, eta.max)
        }
    Text(text = text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
}

/** Mientras [keepOn], la pantalla no se apaga (CUS-TRK-012); al salir o al terminar el pedido, vuelve a lo normal. */
@Composable
internal fun KeepScreenOn(keepOn: Boolean) {
    val view = LocalView.current
    DisposableEffect(view, keepOn) {
        view.keepScreenOn = keepOn
        onDispose { view.keepScreenOn = false }
    }
}
