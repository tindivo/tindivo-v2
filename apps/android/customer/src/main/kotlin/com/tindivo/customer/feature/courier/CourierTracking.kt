package com.tindivo.customer.feature.courier

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSecondaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** La hora de Lima del plazo, «10:45 pm», para quien no tiene reloj del servidor (AGENTS.md 10). */
private val LIMA: ZoneId = ZoneId.of("America/Lima")
private val DEADLINE_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("h:mm a", Locale.forLanguageTag("es-PE"))

/** El seguimiento de una entrega cargada: titular, pasos, nota de la fase, resumen y la acción que toque. */
@Composable
internal fun Tracking(
    tracking: CourierTrackingUi,
    cancel: CancelUiState,
    countdown: AcceptCountdownUi?,
    nav: CourierDetailNav,
    actions: CancelActions,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(TindivoSpacing.screen),
        verticalArrangement = Arrangement.spacedBy(TindivoSpacing.screen),
    ) {
        Text(
            text = stringResource(tracking.phase.headlineRes()),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier =
                Modifier.semantics {
                    heading()
                    liveRegion = LiveRegionMode.Polite
                },
        )
        Steps(tracking.phase)
        PhaseNote(tracking, countdown)
        Summary(tracking)
        when {
            tracking.phase.isCancellable() -> {
                CancelBlock(cancel, actions)
            }

            tracking.phase is CourierPhase.Delivered -> {
                RequestAgain(R.string.courier_reorder, nav.onRequestAgain)
            }

            tracking.phase is CourierPhase.Cancelled -> {
                RequestAgain(
                    R.string.courier_reorder_cancelled,
                    nav.onRequestAgain,
                )
            }
        }
    }
}

/** Los cuatro pasos de la web. Una cancelada o un estado desconocido no los muestra (no se inventa en qué va). */
@Composable
private fun Steps(phase: CourierPhase) {
    val reached =
        when (phase) {
            is CourierPhase.Active -> phase.step.ordinal
            CourierPhase.Delivered -> CourierStep.Delivered.ordinal
            else -> return
        }
    Row(horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.tight), modifier = Modifier.fillMaxWidth()) {
        CourierStep.entries.forEach { step ->
            val label = stringResource(step.labelRes())
            val done = step.ordinal <= reached
            val description =
                stringResource(if (done) R.string.courier_step_done else R.string.courier_step_pending, label)
            Column(
                modifier =
                    Modifier
                        .weight(1f)
                        .semantics(mergeDescendants = true) { contentDescription = description },
            ) {
                LinearProgressIndicator(
                    progress = { if (done) 1f else 0f },
                    modifier = Modifier.fillMaxWidth(),
                    color = if (done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                    trackColor = MaterialTheme.colorScheme.outlineVariant,
                )
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color =
                        if (done) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = TindivoSpacing.hairline),
                )
            }
        }
    }
}

private fun CourierStep.labelRes(): Int =
    when (this) {
        CourierStep.Requested -> R.string.courier_step_requested
        CourierStep.Confirmed -> R.string.courier_step_confirmed
        CourierStep.OnTheWay -> R.string.courier_step_on_the_way
        CourierStep.Delivered -> R.string.courier_step_delivered
    }

/** Lo que toca decir según la fase: la espera con su reloj, el motivo de la cancelación o que llegó. */
@Composable
private fun PhaseNote(
    tracking: CourierTrackingUi,
    countdown: AcceptCountdownUi?,
) {
    when (val phase = tracking.phase) {
        is CourierPhase.Active -> {
            if (phase.step == CourierStep.Requested) Waiting(tracking, countdown)
        }

        CourierPhase.Delivered -> {
            Text(text = stringResource(R.string.courier_delivered_text), style = MaterialTheme.typography.bodyLarge)
        }

        is CourierPhase.Cancelled -> {
            Column(verticalArrangement = Arrangement.spacedBy(TindivoSpacing.hairline)) {
                Text(text = stringResource(cancelReasonRes(phase.reason)), style = MaterialTheme.typography.bodyLarge)
                // Sin motorizado no se cobró nada: decirlo evita la duda de «¿me cobraron?».
                if (phase.wasFree()) {
                    Text(
                        text = stringResource(R.string.courier_nothing_charged),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }

        CourierPhase.Unknown -> {
            Unit
        }
    }
}

/** «Se cancela sola en mm:ss» contra el plazo del servidor (el mismo que ve el motorizado); rojo a los 5 minutos. */
@Composable
private fun Waiting(
    tracking: CourierTrackingUi,
    countdown: AcceptCountdownUi?,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight)) {
        val deadline = tracking.acceptDeadline
        Text(
            text =
                if (deadline != null) {
                    stringResource(R.string.courier_waiting_until, DEADLINE_FORMAT.format(deadline.atZone(LIMA)))
                } else {
                    stringResource(R.string.courier_waiting, tracking.acceptMinutes)
                },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        countdown?.let { clock ->
            val color = if (clock.late) MaterialTheme.colorScheme.error else TindivoColors.brandText
            Text(
                text =
                    if (clock.expired) {
                        stringResource(R.string.courier_countdown_expired)
                    } else {
                        stringResource(R.string.courier_countdown, clock.clock)
                    },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = color,
            )
            LinearProgressIndicator(
                progress = { clock.fraction },
                modifier = Modifier.fillMaxWidth(),
                color = if (clock.late) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.outlineVariant,
            )
        }
    }
}

/** De dónde a dónde, qué, quién lleva, cuánto y quién paga, y el código. Sin teléfonos. */
@Composable
private fun Summary(tracking: CourierTrackingUi) {
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(TindivoSpacing.screen),
            verticalArrangement = Arrangement.spacedBy(TindivoSpacing.hairline),
        ) {
            Text(
                text = stringResource(R.string.courier_route, tracking.originName, tracking.destinationName),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(text = tracking.itemDescription, style = MaterialTheme.typography.bodyMedium)
            tracking.driverName?.let {
                Text(text = stringResource(R.string.courier_driver, it), style = MaterialTheme.typography.bodyMedium)
            }
            val fee = if (tracking.phase.wasFree()) stringResource(R.string.courier_free) else tracking.feeText
            Text(text = stringResource(R.string.courier_detail_fee, fee), style = MaterialTheme.typography.bodyMedium)
            if (!tracking.phase.isTerminal()) {
                Text(
                    text =
                        stringResource(
                            if (tracking.payerIsOrigin) {
                                R.string.courier_detail_payer_origin
                            } else {
                                R.string.courier_detail_payer_destination
                            },
                        ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = stringResource(R.string.courier_detail_code, tracking.shortId),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * Cancelar pide un segundo toque; mientras cancela, el botón queda cargando y un toque más no envía otra vez. Tras la
 * respuesta del servidor ([CancelUiState.locked]) el botón no vuelve hasta que el seguimiento se ponga al día.
 */
@Composable
private fun CancelBlock(
    cancel: CancelUiState,
    actions: CancelActions,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight)) {
        cancel.message?.let {
            Text(text = cancelMessageText(it), color = MaterialTheme.colorScheme.error)
        }
        if (cancel.confirming || cancel.cancelling) {
            Text(
                text = stringResource(R.string.courier_cancel_question),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Start,
            )
            TindivoPrimaryButton(
                text = stringResource(R.string.courier_cancel_confirm),
                onClick = actions.onConfirm,
                loading = cancel.cancelling,
            )
            TindivoSecondaryButton(
                text = stringResource(R.string.courier_cancel_keep),
                onClick = actions.onDismiss,
                enabled = !cancel.cancelling,
            )
        } else if (!cancel.locked) {
            TindivoSecondaryButton(text = stringResource(R.string.courier_cancel), onClick = actions.onAsk)
        }
    }
}

@Composable
private fun RequestAgain(
    label: Int,
    onClick: () -> Unit,
) {
    TindivoPrimaryButton(text = stringResource(label), onClick = onClick)
}
