package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R
import java.time.Instant
import java.time.ZoneId

/** Lo que el negocio permite hacer ahora con su carta (CUS-CAT-012, CUS-CAT-015). */
internal sealed interface OrderingMode {
    /** Se puede agregar a la bolsa y pedir. */
    data object Open : OrderingMode

    /** Cerrado, pausado o sin confirmar la jornada: la carta se ve, no se agrega. */
    data class Closed(
        val status: OpenStatus.Closed,
        /** «sáb»: el día de la próxima apertura, para cuando no es hoy ni mañana. */
        val opensDay: String?,
    ) : OrderingMode

    /** Modo catálogo: se pide por WhatsApp o se llama; cierre y pausa no lo bloquean. */
    data class Contact(
        val whatsappNumber: String?,
    ) : OrderingMode

    val allowsBag: Boolean get() = this is Open
}

/** Catálogo primero (WhatsApp es el pedido y no lo cierra el horario); luego el horario del negocio. */
internal fun orderingModeFor(
    business: BusinessDetailUi,
    now: Instant,
): OrderingMode {
    if (business.catalogOnly) return OrderingMode.Contact(business.whatsappNumber)
    val status = openStatus(business.schedule, now, business.openingConfirmed)
    if (status !is OpenStatus.Closed) return OrderingMode.Open
    val today = now.atZone(LIMA).dayOfWeek.value - 1
    return OrderingMode.Closed(status, DAY_NAMES[(today + status.daysAhead) % DAY_NAMES.size])
}

/** Qué hace tocar un plato: abrir su ficha si el negocio deja pedir; si no (cerrado o modo catálogo), nada. */
internal fun dishClickFor(
    ordering: OrderingMode,
    open: (MenuItemUi) -> Unit,
): ((MenuItemUi) -> Unit)? = if (ordering.allowsBag) open else null

/** `https://wa.me/51987654321` desde `+51987654321`; `null` si no queda ningún dígito. */
internal fun whatsappUri(number: String): String? =
    number.filter { it.isDigit() }.takeIf { it.isNotEmpty() }?.let { "https://wa.me/$it" }

/** `tel:+51987654321`; `null` si no queda ningún dígito. */
internal fun telUri(number: String): String? =
    number.filter { it.isDigit() || it == '+' }.takeIf { it.any(Char::isDigit) }?.let { "tel:$it" }

private val DAY_NAMES = listOf("lun", "mar", "mié", "jue", "vie", "sáb", "dom")
private val LIMA: ZoneId = ZoneId.of("America/Lima")

/** El aviso de un negocio cerrado: «Cerrado ahora» y cuándo abre, o por qué no atiende hoy. */
@Composable
internal fun ClosedBar(closed: OrderingMode.Closed) {
    val status = closed.status
    val title = stringResource(R.string.business_closed_title)
    val detail =
        when {
            status.notConfirmed -> stringResource(R.string.business_closed_unconfirmed)
            status.opensAt == null -> stringResource(R.string.business_closed_no_next)
            status.daysAhead == 0 -> stringResource(R.string.business_opens_today, status.opensAt)
            status.daysAhead == 1 -> stringResource(R.string.business_opens_tomorrow, status.opensAt)
            else -> stringResource(R.string.business_opens_day, closed.opensDay.orEmpty(), status.opensAt)
        }
    Surface(shadowElevation = 8.dp, modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(text = title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(text = detail, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

/** «Pedir por WhatsApp» y «Llamar», en lugar de la bolsa, para un negocio en modo catálogo. */
@Composable
internal fun ContactBar(whatsappNumber: String) {
    val uriHandler = LocalUriHandler.current
    val whatsapp = whatsappUri(whatsappNumber)
    val tel = telUri(whatsappNumber)
    if (whatsapp == null && tel == null) return
    Surface(shadowElevation = 8.dp, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            whatsapp?.let {
                Button(onClick = { uriHandler.openUri(it) }, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) {
                    Text(text = stringResource(R.string.business_order_whatsapp))
                }
            }
            tel?.let {
                OutlinedButton(onClick = { uriHandler.openUri(it) }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(text = stringResource(R.string.business_call))
                }
            }
        }
    }
}

/** La barra de abajo de la carta: la bolsa, el aviso de cerrado o los botones de contacto, según [ordering]. */
@Composable
internal fun OrderingBottomBar(
    ordering: OrderingMode,
    bar: CartBarUi?,
    onOpenCart: () -> Unit,
) {
    when (ordering) {
        OrderingMode.Open -> bar?.let { CartBar(bar = it, onClick = onOpenCart) }
        is OrderingMode.Closed -> ClosedBar(ordering)
        is OrderingMode.Contact -> ordering.whatsappNumber?.let { ContactBar(it) }
    }
}
