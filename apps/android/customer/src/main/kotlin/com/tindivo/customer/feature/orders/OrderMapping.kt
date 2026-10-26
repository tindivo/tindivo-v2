package com.tindivo.customer.feature.orders

import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseData
import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseDataItemsInner
import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseDataItemsInnerModifiersInner
import com.tindivo.core.network.generated.model.ListCustomerOrders200ResponseData
import com.tindivo.core.network.generated.model.ListCustomerOrders200ResponseDataItemsInner
import java.time.Instant

// Falla cerrado: si un importe no tiene la forma del contrato o una fecha no se lee, el mapeo devuelve `null` y la
// pantalla entera queda en error. Nunca se enseña un importe a medias ni se suma nada en el cliente.

private const val PICKUP = "pickup"
private const val PENDING_CASH = "pending_cash"
private const val PREPAID = "prepaid"
private const val ITEM_SEPARATOR = " · "

/** Todos los elementos mapeados, o `null` si alguno no se pudo leer. */
private fun <T, R : Any> List<T>.mapAllOrNull(transform: (T) -> R?): List<R>? {
    val result = ArrayList<R>(size)
    for (element in this) result.add(transform(element) ?: return null)
    return result
}

/** `true` si cada importe presente tiene la forma del contrato (uno ausente no cuenta como ilegible). */
private fun allMoneyReadable(amounts: List<String?>): Boolean =
    amounts.all { it == null || apiMoneyTextOrNull(it) != null }

/** Una página del historial; `null` si alguna tarjeta no se pudo leer (la pantalla entera queda en error). */
internal fun ListCustomerOrders200ResponseData.toPageUi(now: Instant): OrdersPageUi? {
    val cards = items.mapAllOrNull { it.toCardUi(now) } ?: return null
    return OrdersPageUi(items = cards, nextCursor = nextCursor)
}

private fun ListCustomerOrders200ResponseDataItemsInner.toCardUi(now: Instant): OrderCardUi? {
    val created = apiInstantOrNull(createdAt) ?: return null
    val totalText = apiMoneyTextOrNull(total) ?: return null
    if (!allMoneyReadable(items.map { it.lineTotal } + deliveryFee)) return null
    return OrderCardUi(
        id = id,
        shortId = shortId,
        businessName = businessName,
        phase = orderPhaseOf(status, cancelReason),
        isPickup = deliveryMethod == PICKUP,
        itemsSummary = items.joinToString(ITEM_SEPARATOR) { "${it.quantity}× ${it.name}" },
        createdAt = relativeDate(created, now),
        total = totalText,
    )
}

/** El detalle de un pedido; `null` si algún importe o la fecha de creación no se pudo leer. */
internal fun GetCustomerOrder200ResponseData.toDetailUi(): OrderDetailUi? {
    val feeText = apiMoneyTextOrNull(deliveryFee) ?: return null
    val totalText = apiMoneyTextOrNull(total) ?: return null
    val lineUis = items.mapAllOrNull { it.toLineUi() } ?: return null
    if (apiInstantOrNull(createdAt) == null || !allMoneyReadable(listOf(paysWith, changeToGive))) return null
    val phase = orderPhaseOf(status, cancelReason)
    val pickup = deliveryMethod == PICKUP
    return OrderDetailUi(
        id = id,
        shortId = shortId,
        businessName = businessName,
        phase = phase,
        headline = headlineOf(phase, status, paymentIntent, pickup),
        isPickup = pickup,
        lines = lineUis,
        deliveryFee = feeText,
        total = totalText,
        cash = cashPaymentOf(),
        address = if (pickup) null else deliveryAddress,
        reference = if (pickup) null else deliveryReference,
        customerNotes = customerNotes,
        driver = driverOf(phase),
        webPaymentNotice = needsWebPayment(),
    )
}

/** Pagar un prepago o apelar un comprobante rechazado solo se puede en la web: la app aún no sube comprobantes. */
private fun GetCustomerOrder200ResponseData.needsWebPayment(): Boolean =
    (paymentIntent == PREPAID && status == "awaiting_payment") || cancelReason == "proof_rejected_final"

private fun GetCustomerOrder200ResponseDataItemsInner.toLineUi(): OrderLineUi? {
    val lineText = apiMoneyTextOrNull(lineTotal)
    val optionUis = modifiers.mapAllOrNull { it.toOptionUi() }
    if (lineText == null || optionUis == null) return null
    return OrderLineUi(quantity = quantity, name = name, note = note, lineTotal = lineText, options = optionUis)
}

private fun GetCustomerOrder200ResponseDataItemsInnerModifiersInner.toOptionUi(): OrderOptionUi? {
    val priceText = apiMoneyTextOrNull(price) ?: return null
    return OrderOptionUi(group = group, name = name, extra = if (apiMoneyIsPositive(price)) "+$priceText" else null)
}

/** «Pagas con» y el vuelto, solo para efectivo pendiente con un importe con el que paga. */
private fun GetCustomerOrder200ResponseData.cashPaymentOf(): CashPaymentUi? {
    val paysWithText = paysWith?.let(::apiMoneyTextOrNull)
    if (paymentIntent != PENDING_CASH || paysWithText == null) return null
    val changeText = changeToGive?.takeIf(::apiMoneyIsPositive)?.let(::apiMoneyTextOrNull)
    val change = if (changeText == null) CashChange.Exact else CashChange.Amount(changeText)
    return CashPaymentUi(paysWith = paysWithText, change = change)
}

/**
 * El motorizado es un dato personal: el nombre solo cuando ya va en camino, ya entregó o llegó a la puerta; el
 * teléfono nunca como texto, solo como botón de WhatsApp cuando el servidor lo manda y el pedido no está entregado.
 */
private fun GetCustomerOrder200ResponseData.driverOf(phase: OrderPhase): DriverUi? {
    val driver = driver ?: return null
    val onTheWay = phase is OrderPhase.Active && phase.step == TrackingStep.OnTheWay
    val nameVisible = onTheWay || phase is OrderPhase.Delivered || arrivedAtCustomerAt != null
    val link =
        driver.phone
            ?.takeIf { phase !is OrderPhase.Delivered }
            ?.let { driverWhatsappLink(it, businessName, shortId) }
    val shownName = driver.name.takeIf { nameVisible }
    return if (shownName == null && link == null) null else DriverUi(name = shownName, whatsappLink = link)
}
