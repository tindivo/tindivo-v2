package com.tindivo.customer.feature.orders

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.StatusRow
import com.tindivo.customer.R

@Composable
internal fun OrderHeadlineBlock(headline: OrderHeadline) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        when (headline) {
            is OrderHeadline.Progress -> {
                Text(
                    text = stringResource(headline.hero.titleRes()),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                headline.hero.subtitleRes()?.let {
                    Text(
                        text = stringResource(it),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }

            is OrderHeadline.Cancelled -> {
                Text(
                    text = stringResource(R.string.order_cancelled_eyebrow),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.error,
                )
                Text(
                    text = stringResource(headline.copy.titleRes()),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(headline.copy.bodyRes(headline.alreadyPaid)),
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }
    }
}

/** Los cuatro pasos; los ya alcanzados van resaltados y marcados como seleccionados para el lector de pantalla. */
@Composable
internal fun OrderSteps(
    phase: OrderPhase,
    isPickup: Boolean,
) {
    val reachedIndex =
        when (phase) {
            is OrderPhase.Active -> phase.step.ordinal
            OrderPhase.Delivered -> TrackingStep.Delivered.ordinal
            else -> -1
        }
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TrackingStep.entries.forEach { step ->
            val reached = step.ordinal <= reachedIndex
            Column(
                modifier = Modifier.weight(1f).semantics(mergeDescendants = true) { selected = reached },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                val dot = if (reached) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
                Row(modifier = Modifier.size(12.dp).background(dot, CircleShape)) {}
                Text(
                    text = stringResource(step.labelRes(isPickup)),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (reached) FontWeight.Bold else FontWeight.Normal,
                )
            }
        }
    }
}

/** Quién trae el pedido. El teléfono nunca se escribe: solo el botón, con el motorizado en la puerta. */
@Composable
internal fun DriverBlock(
    driver: DriverUi,
    onOpenLink: (String) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            driver.name?.let { name ->
                Text(
                    text = stringResource(R.string.order_driver_label),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(text = name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            if (driver.atDoor) {
                Text(text = stringResource(R.string.order_driver_at_door), style = MaterialTheme.typography.bodyMedium)
            }
            driver.whatsappLink?.let { link ->
                Button(
                    onClick = { onOpenLink(link) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
                ) {
                    Text(text = stringResource(R.string.order_driver_whatsapp))
                }
            }
        }
    }
}

@Composable
internal fun OrderLines(lines: List<OrderLineUi>) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        lines.forEach { line ->
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        text = stringResource(R.string.order_quantity_name, line.quantity, line.name),
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = line.lineTotal,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                    )
                }
                // Como la web: solo el nombre de la opción y, si cuesta, el extra a la derecha.
                line.options.forEach { option ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(start = 20.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = option.name,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                        option.extra?.let {
                            Text(
                                text = it,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                line.note?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** Envío, «Pagas con» y total: los importes tal como los mandó la API, sin sumar nada. */
@Composable
internal fun OrderTotals(order: OrderDetailUi) {
    Column {
        HorizontalDivider()
        if (!order.isPickup) {
            StatusRow(label = stringResource(R.string.order_delivery_fee), value = order.deliveryFee)
        }
        order.cash?.let { cash ->
            StatusRow(label = stringResource(R.string.order_pays_with), value = cash.paysWith)
            Text(
                text =
                    when (val change = cash.change) {
                        is CashChange.Amount -> stringResource(R.string.order_change, change.text)
                        CashChange.Exact -> stringResource(R.string.order_change_exact)
                    },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        StatusRow(
            label = stringResource(if (order.totalPaid) R.string.order_total_paid else R.string.order_total),
            value = order.total,
        )
    }
}

/** Dirección y referencia (solo delivery) y la nota del cliente. */
@Composable
internal fun OrderDelivery(order: OrderDetailUi) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        order.address?.let { LabeledText(label = stringResource(R.string.order_address), value = it) }
        order.reference?.let { LabeledText(label = stringResource(R.string.order_reference), value = it) }
        order.customerNotes?.let { LabeledText(label = stringResource(R.string.order_customer_note), value = it) }
    }
}

@Composable
private fun LabeledText(
    label: String,
    value: String,
) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(text = value, style = MaterialTheme.typography.bodyLarge)
    }
}
