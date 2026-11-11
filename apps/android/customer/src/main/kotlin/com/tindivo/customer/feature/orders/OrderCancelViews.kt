package com.tindivo.customer.feature.orders

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R

/** Lo que la pantalla le pide a [CancelOrderViewModel]. */
internal data class CancelActions(
    val askToConfirm: () -> Unit = {},
    val dismiss: () -> Unit = {},
    val confirm: () -> Unit = {},
)

/** La sección «Cancelar» del detalle: lo que se ve y qué hace. */
internal data class CancelSection(
    val state: CancelUiState = CancelUiState(),
    val actions: CancelActions = CancelActions(),
)

/**
 * La fila de cancelar, justo debajo del titular, como enlace y no como botón grande (`TrackingCancelRow` de la web).
 * Con [CancelOffer.ViaSupport] no hay botón: hubo dinero de por medio y se cancela escribiendo a soporte.
 */
@Composable
internal fun CancelRow(
    offer: CancelOffer,
    section: CancelSection,
    supportLink: String?,
    onOpenLink: (String) -> Unit,
) {
    when (offer) {
        CancelOffer.None -> {
            Unit
        }

        CancelOffer.ViaSupport -> {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = stringResource(R.string.order_cancel_via_support),
                    style = MaterialTheme.typography.bodyMedium,
                )
                SupportLink(link = supportLink, onOpenLink = onOpenLink)
            }
        }

        CancelOffer.PayOnDelivery, CancelOffer.Prepaid -> {
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.order_cancel_row_title),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = stringResource(R.string.order_cancel_row_sub),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    TextButton(
                        onClick = section.actions.askToConfirm,
                        enabled = !section.state.cancelling && !section.state.settled,
                        modifier = Modifier.heightIn(min = 48.dp),
                        colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    ) {
                        Text(text = stringResource(R.string.order_cancel_action), fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            if (section.state.confirming) CancelDialog(offer = offer, section = section)
        }
    }
}

/** «¿Cancelar tu pedido?». El aviso de dinero depende del método: el prepago aún no ha pagado nada. */
@Composable
private fun CancelDialog(
    offer: CancelOffer,
    section: CancelSection,
) {
    val cancelling = section.state.cancelling
    AlertDialog(
        onDismissRequest = section.actions.dismiss,
        title = { Text(stringResource(R.string.order_cancel_dialog_title)) },
        text = {
            Text(
                stringResource(
                    if (offer == CancelOffer.Prepaid) {
                        R.string.order_cancel_dialog_body_prepaid
                    } else {
                        R.string.order_cancel_dialog_body_on_delivery
                    },
                ),
            )
        },
        confirmButton = {
            TextButton(
                onClick = section.actions.confirm,
                enabled = !cancelling,
                modifier = Modifier.heightIn(min = 48.dp),
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) {
                Text(
                    stringResource(if (cancelling) R.string.order_cancel_confirming else R.string.order_cancel_confirm),
                )
            }
        },
        dismissButton = {
            TextButton(
                onClick = section.actions.dismiss,
                enabled = !cancelling,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.order_cancel_keep))
            }
        },
    )
}

/** Lo que salió mal al cancelar; el detalle ya se está volviendo a consultar. */
@Composable
internal fun CancelProblemText(problem: CancelProblem) {
    val text =
        when (problem) {
            CancelProblem.Offline -> stringResource(R.string.error_network)
            is CancelProblem.NotCancellable -> problem.detail ?: stringResource(R.string.order_cancel_not_cancellable)
            CancelProblem.Generic -> stringResource(R.string.order_cancel_failed)
        }
    Text(text = text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
}

/** «¿Algún problema? Escríbenos»: abre WhatsApp de soporte. Sin número de soporte no se muestra. */
@Composable
internal fun SupportLink(
    link: String?,
    onOpenLink: (String) -> Unit,
    @StringRes label: Int = R.string.order_support_link,
) {
    if (link == null) return
    TextButton(onClick = { onOpenLink(link) }, modifier = Modifier.heightIn(min = 48.dp)) {
        Text(text = stringResource(label))
    }
}

/**
 * Un pedido cancelado, como `CancelledView` de la web: el motivo, «Volver al menú» y soporte. Un comprobante rechazado
 * del todo no se apela en la app (Jesús, 2026-11-10): el botón grande es escribir a soporte.
 */
@Composable
internal fun CancelledBody(
    order: OrderDetailUi,
    supportLink: String?,
    onOpenLink: (String) -> Unit,
    onBackToMenu: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        OrderHeadlineBlock(headline = order.headline)
        if (order.appealViaSupport && supportLink != null) {
            Button(
                onClick = { onOpenLink(supportLink) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
            ) {
                Text(text = stringResource(R.string.order_support_whatsapp))
            }
        }
        Button(
            onClick = onBackToMenu,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.order_back_to_menu))
        }
        if (!order.appealViaSupport) {
            SupportLink(link = supportLink, onOpenLink = onOpenLink)
        }
    }
}
