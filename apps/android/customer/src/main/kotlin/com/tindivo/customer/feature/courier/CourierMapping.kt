package com.tindivo.customer.feature.courier

import com.tindivo.core.network.generated.model.CreateCourierOrder201ResponseData
import com.tindivo.core.network.generated.model.GetCourierServiceStatus200Response
import com.tindivo.core.network.generated.model.GetCourierTracking200Response
import com.tindivo.core.network.generated.model.ListCustomerCourierOrders200ResponseData
import com.tindivo.core.network.generated.model.ListCustomerCourierOrders200ResponseDataFrequentContactsInner
import com.tindivo.core.network.generated.model.ListCustomerCourierOrders200ResponseDataItemsInner
import com.tindivo.core.network.generated.model.ListCustomerCourierOrders200ResponseDataItemsInnerOrigin
import com.tindivo.customer.feature.cart.formatSoles
import com.tindivo.customer.feature.cart.menuPriceOrNull
import com.tindivo.customer.feature.orders.apiInstantOrNull
import com.tindivo.customer.feature.orders.apiMoneyTextOrNull
import java.math.BigDecimal

/**
 * Un importe `number` heredado (precio base, tarifa del alta y del seguimiento) listo para mostrar, o `null` si no es
 * un `numeric(10,2)` válido. Solo para mostrar (KT-8): no redondea ni calcula; quien recibe `null` falla cerrado.
 */
internal fun legacyMoneyTextOrNull(amount: BigDecimal): String? = menuPriceOrNull(amount)?.let(::formatSoles)

/** El estado del servicio, o `null` si el precio no se puede mostrar tal cual (no se deja pedir con un precio dudoso). */
internal fun GetCourierServiceStatus200Response.toServiceUi(): CourierServiceUi? {
    val price = legacyMoneyTextOrNull(price) ?: return null
    return CourierServiceUi(
        enabled = enabled,
        openNow = openNow,
        priceText = price,
        opensAt = hours?.start,
        closesAt = hours?.end,
        pausedMessage = pausedMessage?.takeIf { it.isNotBlank() },
    )
}

/** Una página, o `null` si alguna entrega trae un importe o una fecha que no se pueden leer (falla cerrado). */
internal fun ListCustomerCourierOrders200ResponseData.toPageUi(): CourierPageUi? {
    val cards = items.map { it.toCardUi() ?: return null }
    return CourierPageUi(
        items = cards,
        nextCursor = nextCursor,
        contacts = frequentContacts.map { it.toContactUi() },
    )
}

private fun ListCustomerCourierOrders200ResponseDataItemsInner.toCardUi(): CourierCardUi? {
    val phase = courierPhaseOf(status, cancelReason)
    val fee = apiMoneyTextOrNull(feeAmount) ?: return null
    val created = apiInstantOrNull(createdAt) ?: return null
    return CourierCardUi(
        id = id,
        shortId = shortId,
        phase = phase,
        originLabel = origin.label(),
        destinationLabel = destination.label(),
        itemDescription = itemDescription,
        feeText = fee,
        createdAt = created,
        driverName = driverName?.takeIf { it.isNotBlank() },
    )
}

/** Los rótulos que el sistema pone cuando nadie escribió un nombre: no identifican a nadie, se muestra el sitio. */
private val FALLBACK_NAMES = setOf("quien entrega", "quien recibe")

private fun ListCustomerCourierOrders200ResponseDataItemsInnerOrigin.label(): String =
    name.trim().takeUnless { it.isEmpty() || it.lowercase() in FALLBACK_NAMES } ?: referenceText

private fun ListCustomerCourierOrders200ResponseDataFrequentContactsInner.toContactUi() =
    CourierContactUi(
        name = name.trim(),
        phone = phone,
        referenceText = referenceText,
        lat = coordinates.lat,
        lng = coordinates.lng,
    )

/** El seguimiento, o `null` si la tarifa o el plazo no se pueden leer. */
internal fun GetCourierTracking200Response.toTrackingUi(): CourierTrackingUi? {
    val fee = legacyMoneyTextOrNull(feeAmount) ?: return null
    val deadline =
        acceptDeadline?.let { raw -> apiInstantOrNull(raw) ?: return null }
    return CourierTrackingUi(
        shortId = shortId,
        phase = courierPhaseOf(status, cancelReason),
        originName = originName,
        destinationName = destinationName,
        itemDescription = itemDescription,
        feeText = fee,
        payerIsOrigin = payer == "origin",
        driverName = driverName?.takeIf { it.isNotBlank() },
        acceptMinutes = acceptMinutes,
        acceptDeadline = deadline,
    )
}

internal fun CreateCourierOrder201ResponseData.toCreated() = CreatedCourier(id = id, shortId = shortId)
