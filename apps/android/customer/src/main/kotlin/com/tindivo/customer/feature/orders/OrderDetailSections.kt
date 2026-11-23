package com.tindivo.customer.feature.orders

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.StatusRow
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.customer.R

@Composable
internal fun OrderHeadlineBlock(
    headline: OrderHeadline,
    driver: DriverUi? = null,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        when (headline) {
            is OrderHeadline.Progress -> {
                // El motorizado marcó «Llegué»: el titular lo dice con su nombre y el subtítulo pide salir (CUS-TRK-021).
                val arrived = headline.hero == OrderHero.OnTheWay && driver?.atDoor == true
                val firstName = if (arrived) driverFirstName(driver?.name) else null
                Text(
                    text =
                        when {
                            firstName != null -> stringResource(R.string.order_driver_arrived_title, firstName)
                            arrived -> stringResource(R.string.order_driver_arrived_anonymous)
                            else -> stringResource(headline.hero.titleRes())
                        },
                    style = MaterialTheme.typography.headlineMedium,
                )
                val subtitle = if (arrived) R.string.order_driver_arrived_sub else headline.hero.subtitleRes()
                subtitle?.let {
                    Text(
                        text = stringResource(it),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
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
                if (headline.copy.nothingCharged(headline.alreadyPaid)) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.tertiaryContainer,
                        contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                        modifier = Modifier.padding(vertical = 4.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.order_cancel_nothing_charged),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        )
                    }
                }
                Text(
                    text = stringResource(headline.copy.bodyRes(headline.alreadyPaid)),
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }
    }
}

/**
 * Los cuatro pasos como barras (tablero «Seguimiento»): verde lo ya hecho, naranja el paso actual y gris lo que falta;
 * debajo, el nombre de cada paso. Los alcanzados van marcados como seleccionados para el lector de pantalla.
 */
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
    val scheme = MaterialTheme.colorScheme
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        TrackingStep.entries.forEach { step ->
            val reached = step.ordinal <= reachedIndex
            val current = step.ordinal == reachedIndex && phase !is OrderPhase.Delivered
            val bar =
                when {
                    current -> scheme.primary
                    reached -> scheme.onTertiaryContainer
                    else -> scheme.outline
                }
            Column(
                modifier = Modifier.weight(1f).semantics(mergeDescendants = true) { selected = reached },
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(modifier = Modifier.fillMaxWidth().height(6.dp).background(bar, CircleShape))
                Text(
                    text = stringResource(step.labelRes(isPickup)),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (current) FontWeight.Bold else FontWeight.Normal,
                    color = if (reached) scheme.onSurface else scheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Quién trae el pedido: su nombre completo. Que llegó lo dice el titular de arriba. Ningún dato de contacto. */
@Composable
internal fun DriverBlock(driver: DriverUi) {
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier =
                    Modifier
                        .size(
                            40.dp,
                        ).background(Brush.linearGradient(TindivoColors.gradientCta), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(TindivoIcons.Person, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary)
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(text = driver.name, style = MaterialTheme.typography.titleLarge)
                Text(
                    text = stringResource(R.string.order_driver_label),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
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
        // El total va antes que «Pagas con» y en negrita grande: es lo que se mira primero.
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = stringResource(if (order.totalPaid) R.string.order_total_paid else R.string.order_total),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(text = order.total, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
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
