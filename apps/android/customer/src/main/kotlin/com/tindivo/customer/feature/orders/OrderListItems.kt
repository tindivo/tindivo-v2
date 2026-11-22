package com.tindivo.customer.feature.orders

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R
import com.tindivo.customer.support.cancelledOrderSupportLink

private val THUMB = 48.dp
private val THUMB_MARK_WIDTH = 30.dp
private const val MARK_RATIO = 158f / 93f
private val MOTO_WIDTH = 72.dp
private const val MOTO_RATIO = 440f / 398f
private val SEGMENT_HEIGHT = 6.dp
private const val STEPS = 4

/** «Fecha · total», la segunda línea de toda fila de pedido. */
@Composable
private fun OrderCardUi.subtitle(): String = relativeDateText(createdAt) + " · " + total

/** El cuadro de 48 dp con el isotipo: el negocio aún no manda su logo en el historial. */
@Composable
private fun OrderThumb() {
    Box(
        modifier =
            Modifier
                .size(THUMB)
                .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            bitmap = ImageBitmap.imageResource(R.drawable.ic_tindivo_isotipo),
            contentDescription = null,
            modifier = Modifier.width(THUMB_MARK_WIDTH).aspectRatio(MARK_RATIO),
        )
    }
}

@Composable
private fun NameAndSubtitle(
    order: OrderCardUi,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = order.businessName ?: stringResource(R.string.order_business_fallback),
            style = MaterialTheme.typography.titleMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = order.subtitle(),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        // El código del pedido: con él se habla con soporte.
        Text(
            text = stringResource(R.string.order_short_id, order.shortId),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * El pedido en curso (tablero «8 · Mis pedidos»): tarjeta compacta con una sola acción, «Ver seguimiento». La etapa va
 * en texto y en una barra de cuatro segmentos que TalkBack lee como «Etapa N de 4».
 */
@Composable
internal fun ActiveOrderCard(
    order: OrderCardUi,
    step: TrackingStep,
    onOpen: () -> Unit,
) {
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(TindivoSpacing.screen),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OrderThumb()
                NameAndSubtitle(order = order, modifier = Modifier.weight(1f))
                Image(
                    painter = painterResource(R.drawable.img_moto_tindivo),
                    contentDescription = null,
                    modifier = Modifier.width(MOTO_WIDTH).aspectRatio(MOTO_RATIO),
                )
            }
            StepProgress(step = step, isPickup = order.isPickup)
            TindivoPrimaryButton(text = stringResource(R.string.orders_track), onClick = onOpen)
        }
    }
}

@Composable
private fun StepProgress(
    step: TrackingStep,
    isPickup: Boolean,
) {
    val label = stringResource(step.labelRes(isPickup))
    val description = stringResource(R.string.orders_step_progress, step.filledSegments(), STEPS, label)
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(modifier = Modifier.size(8.dp).background(TindivoColors.brand, CircleShape))
            Text(text = label, style = MaterialTheme.typography.titleLarge)
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp).semantics { contentDescription = description },
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            repeat(STEPS) { index ->
                val filled = index < step.filledSegments()
                Box(
                    modifier =
                        Modifier
                            .weight(1f)
                            .height(SEGMENT_HEIGHT)
                            .background(
                                if (filled) TindivoColors.brand else MaterialTheme.colorScheme.outlineVariant,
                                CircleShape,
                            ),
                )
            }
        }
    }
}

/** Los pedidos anteriores en una sola tarjeta blanca, separados por un divisor, como el tablero. */
@Composable
internal fun PastOrdersCard(
    orders: List<OrderCardUi>,
    onOpenOrder: (OrderCardUi) -> Unit,
    actions: OrderCardActions,
) {
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(horizontal = TindivoSpacing.screen)) {
            orders.forEachIndexed { index, order ->
                if (index > 0) HorizontalDivider(color = TindivoColors.border)
                PastOrderItem(order = order, onClick = { onOpenOrder(order) }, actions = actions)
            }
        }
    }
}

@Composable
private fun PastOrderItem(
    order: OrderCardUi,
    onClick: () -> Unit,
    actions: OrderCardActions,
) {
    Column(modifier = Modifier.padding(vertical = 12.dp)) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp)
                    .clickable(onClick = onClick, role = Role.Button),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OrderThumb()
            NameAndSubtitle(order = order, modifier = Modifier.weight(1f))
            PhaseLabel(order)
        }
        val linkModifier = Modifier.padding(start = THUMB + 12.dp)
        // Como la web: volver a pedir abre la carta del negocio; la bolsa no se toca.
        if (order.reorderable) {
            InlineAction(
                text = stringResource(R.string.order_reorder),
                icon = TindivoIcons.Replay,
                onClick = { actions.onReorder(order.businessId.toString()) },
                modifier = linkModifier,
            )
        }
        if (order.paymentCase) {
            InlineAction(text = stringResource(R.string.order_payment_case), onClick = onClick, modifier = linkModifier)
        }
        if (order.phase is OrderPhase.Cancelled) {
            Box(modifier = linkModifier) {
                SupportLink(
                    link = cancelledOrderSupportLink(actions.supportNumber, order.shortId),
                    onOpenLink = actions.onOpenLink,
                    label = R.string.order_support_cancelled,
                )
            }
        }
    }
}

/** El estado con icono y color: el texto dice lo mismo que el color. */
@Composable
private fun PhaseLabel(order: OrderCardUi) {
    val (icon, color) =
        when (order.phase) {
            OrderPhase.Delivered -> TindivoIcons.Check to MaterialTheme.colorScheme.onTertiaryContainer
            is OrderPhase.Cancelled -> TindivoIcons.Close to MaterialTheme.colorScheme.onErrorContainer
            else -> null to MaterialTheme.colorScheme.onSurfaceVariant
        }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        if (icon != null) Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
        Text(
            text = stringResource(order.phase.labelRes(order.isPickup)),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = color,
        )
    }
}

@Composable
private fun InlineAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
) {
    Row(
        modifier = modifier.heightIn(min = TindivoSpacing.touchTarget).clickable(onClick = onClick, role = Role.Button),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (icon !=
            null
        ) {
            Icon(icon, contentDescription = null, tint = TindivoColors.brandText, modifier = Modifier.size(18.dp))
        }
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = TindivoColors.brandText,
        )
    }
}

/** Sin pedidos: ilustración del tablero, título y «Hacer un pedido». */
@Composable
internal fun EmptyOrders(onExplore: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 48.dp, start = 16.dp, end = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(
            painter = painterResource(R.drawable.img_orders_empty),
            contentDescription = null,
            modifier = Modifier.size(200.dp).clip(RoundedCornerShape(28.dp)),
        )
        Text(
            text = stringResource(R.string.orders_empty_title),
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(top = 24.dp).semantics { heading() },
        )
        TindivoPrimaryButton(
            text = stringResource(R.string.orders_empty_action),
            onClick = onExplore,
            modifier = Modifier.padding(top = 24.dp).width(240.dp),
        )
    }
}
