package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.generated.model.CreateOrderRequest
import com.tindivo.core.network.generated.model.CreateOrderRequestCoordinates
import com.tindivo.core.network.generated.model.CreateOrderRequestItemsInner
import com.tindivo.core.network.generated.model.QuoteCheckoutRequest
import com.tindivo.core.network.generated.model.QuoteCheckoutRequestItemsInner
import com.tindivo.customer.feature.cart.Cart
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.UUID

private fun String.toUuidOrNull(): UUID? =
    try {
        UUID.fromString(this)
    } catch (ignored: IllegalArgumentException) {
        null
    }

private fun Cart.menuItems(): List<Triple<UUID, Int, List<UUID>>>? {
    val items =
        lines.map { line ->
            val id = line.itemId.toUuidOrNull()
            val modifiers = line.modifiers.map { it.optionId.toUuidOrNull() }
            if (id == null ||
                modifiers.any { it == null }
            ) {
                null
            } else {
                Triple(id, line.quantity, modifiers.filterNotNull())
            }
        }
    return if (items.any { it == null }) null else items.filterNotNull()
}

private fun DeliveryChoice.wire() =
    if (this ==
        DeliveryChoice.Pickup
    ) {
        QuoteCheckoutRequest.DeliveryMethod.pickup
    } else {
        QuoteCheckoutRequest.DeliveryMethod.delivery
    }

private fun PickupWhen.quoteWire() =
    if (this == PickupWhen.Now) QuoteCheckoutRequest.PickupTiming.now else QuoteCheckoutRequest.PickupTiming.later

private fun PickupWhen.orderWire() =
    if (this == PickupWhen.Now) CreateOrderRequest.PickupTiming.now else CreateOrderRequest.PickupTiming.later

private fun AddressUi.coordinates(): CreateOrderRequestCoordinates? {
    val latitude = lat
    val longitude = lng
    return if (latitude != null && longitude != null) CreateOrderRequestCoordinates(latitude, longitude) else null
}

/**
 * La petición de `POST /customer/checkout/quote`. En un recojo no lleva coordenadas y lleva `pickupTiming`; en un
 * delivery, las de la dirección elegida. `null` si la bolsa trae un id que no es un uuid.
 */
fun buildQuoteRequest(
    state: CheckoutUiState,
    cart: Cart,
): QuoteCheckoutRequest? {
    val businessId = cart.businessId.toUuidOrNull()
    val items = cart.menuItems()
    if (businessId == null || items == null) return null
    val pickup = state.isPickup
    return QuoteCheckoutRequest(
        businessId = businessId,
        deliveryMethod = state.method.wire(),
        items = items.map { (id, quantity, modifiers) -> QuoteCheckoutRequestItemsInner(id, quantity, modifiers) },
        coordinates = if (pickup) null else state.selectedAddress?.coordinates(),
        pickupTiming = if (pickup) state.pickupWhen?.quoteWire() else null,
    )
}

private fun PayMethod.orderWire() =
    when (this) {
        PayMethod.Cash -> CreateOrderRequest.PaymentIntent.pending_cash
        PayMethod.Yape -> CreateOrderRequest.PaymentIntent.pending_yape
        PayMethod.Prepaid -> CreateOrderRequest.PaymentIntent.prepaid
    }

/** Exactitud del punto: un entero positivo, como pide el contrato (`deliveryPointAccuracyM`). */
private fun BigDecimal.toAccuracy(): Int = setScale(0, RoundingMode.CEILING).toInt().coerceAtLeast(1)

/**
 * La petición de `POST /customer/orders`. `customerPhone` va por compatibilidad (el servidor usa el verificado). En un
 * recojo NO viaja nada de la entrega ni el billete (§8). `cashPayingWith` sale del texto del monto, nunca de un
 * `Double`, y solo en delivery con efectivo. `null` si falta algo que la pantalla ya habría pedido.
 */
fun buildOrderRequest(
    state: CheckoutUiState,
    cart: Cart,
    quote: QuoteView,
): CreateOrderRequest? {
    val businessId = cart.businessId.toUuidOrNull()
    val items = cart.menuItems()
    val phone = state.phone
    val pay = state.pay
    if (businessId == null || items == null || phone == null || pay == null) return null
    val orderItems =
        cart.lines.zip(items).map { (line, item) ->
            CreateOrderRequestItemsInner(item.first, item.second, line.note, item.third)
        }
    val base =
        CreateOrderRequest(
            businessId = businessId,
            deliveryMethod = CreateOrderRequest.DeliveryMethod.valueOf(state.method.name.lowercase()),
            paymentIntent = pay.orderWire(),
            customerName = state.name.trim(),
            customerPhone = phone,
            items = orderItems,
        )
    return if (state.isPickup) {
        base.copy(pickupTiming = state.pickupWhen?.orderWire())
    } else {
        deliveryPart(base, state, quote)
    }
}

private fun deliveryPart(
    base: CreateOrderRequest,
    state: CheckoutUiState,
    quote: QuoteView,
): CreateOrderRequest? {
    val address = state.selectedAddress ?: return null
    val cashPaying = if (state.pay == PayMethod.Cash) state.cash.payingWith(quote.total) else null
    if (state.pay == PayMethod.Cash && cashPaying == null) return null
    return base.copy(
        deliveryAddress = address.line?.trim(),
        deliveryReference = address.reference.trim(),
        coordinates = address.coordinates(),
        cashPayingWith = cashPaying?.let { BigDecimal(it.toPlainString()) },
        customerNotes = state.note.trim().takeIf { it.isNotEmpty() },
        deliveryPointAccuracyM = address.accuracyM?.toAccuracy(),
        deliveryPointConfirmedAt = address.confirmedAt,
    )
}
