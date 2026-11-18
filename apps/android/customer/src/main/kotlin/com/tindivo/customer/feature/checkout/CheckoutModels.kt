package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.generated.model.ListCustomerAddresses200ResponseDataItemsInner
import com.tindivo.core.network.generated.model.QuoteCheckout200ResponseData
import java.math.BigDecimal

enum class DeliveryChoice { Delivery, Pickup }

/** Lo que la persona contestó a «¿Vas al local ahora?». Va en `pickupTiming` (§8 del contrato). */
enum class PickupWhen(
    val wire: String,
) {
    Now("now"),
    Later("later"),
}

/** Cómo declara el billete con el que paga en efectivo. */
sealed interface CashChoice {
    data object None : CashChoice

    data object Exact : CashChoice

    data class Bill(
        val amount: BigDecimal,
    ) : CashChoice

    /** Lo escrito en «Otro», tal cual: [parseCashInput] decide si vale. */
    data class Other(
        val text: String,
    ) : CashChoice
}

/** El monto con el que paga, o `null` si aún no hay uno válido. El «exacto» es el total de la cotización. */
fun CashChoice.payingWith(total: BigDecimal): BigDecimal? =
    when (this) {
        CashChoice.None -> null
        CashChoice.Exact -> total
        is CashChoice.Bill -> amount
        is CashChoice.Other -> parseCashInput(text)
    }

/** Una dirección guardada, ya leída. */
data class AddressUi(
    val id: String,
    val label: String,
    val line: String?,
    val reference: String,
    val lat: BigDecimal?,
    val lng: BigDecimal?,
    val confirmedAt: String?,
    val accuracyM: BigDecimal?,
    val isDefault: Boolean,
) {
    val lineOk: Boolean get() = line.orEmpty().trim().length >= MIN_ADDRESS_LENGTH
    val referenceOk: Boolean get() = reference.trim().length >= MIN_REFERENCE_LENGTH
    val hasLocation: Boolean get() = lat != null && lng != null
    val locationConfirmed: Boolean get() = confirmedAt != null
}

/** Lo mínimo que acepta `POST /customer/orders` para `deliveryAddress` y `deliveryReference`. */
const val MIN_ADDRESS_LENGTH = 5
const val MIN_REFERENCE_LENGTH = 5
const val MAX_NAME_LENGTH = 120
const val MAX_DRIVER_NOTE_LENGTH = 200

fun ListCustomerAddresses200ResponseDataItemsInner.toAddressUi(): AddressUi =
    AddressUi(
        id = id.toString(),
        label = label,
        line = line,
        reference = reference,
        lat = coordinates?.lat,
        lng = coordinates?.lng,
        confirmedAt = locationConfirmedAt,
        accuracyM = locationAccuracyM,
        isDefault = isDefault,
    )

/** La dirección por defecto (`is_default`), o la primera si ninguna lo es. */
fun List<AddressUi>.preferred(): AddressUi? = firstOrNull { it.isDefault } ?: firstOrNull()

/**
 * La cotización ya leída. Todo importe pasó por [parseApiAmount]: si alguno no tiene la forma del contrato no hay
 * [QuoteView] y la pantalla no deja confirmar.
 */
data class QuoteView(
    val subtotal: BigDecimal,
    val deliveryFee: BigDecimal,
    val nominalDeliveryFee: BigDecimal,
    val freeDelivery: Boolean,
    /** `launch_promo`, `dish` u otro valor que llegue; `null` si no hay envío gratis. */
    val freeReason: String?,
    val far: Boolean,
    val total: BigDecimal,
    val prepayThreshold: BigDecimal,
    val options: List<PayOption>,
    val cash: CashRules?,
    val lineTotals: List<BigDecimal>,
)

fun QuoteCheckout200ResponseData.toQuoteViewOrNull(): QuoteView? {
    val sub = parseApiAmount(subtotal)
    val fee = parseApiAmount(deliveryFee)
    val nominal = parseApiAmount(nominalDeliveryFee)
    val totalAmount = parseApiAmount(total)
    val threshold = parseApiAmount(prepayThreshold)
    val lines = items.map { parseApiAmount(it.lineTotal) }
    val sane = sub != null && fee != null && nominal != null && totalAmount != null && threshold != null
    if (!sane || lines.any { it == null }) return null
    val cashRules = payment.cash?.let { cashRulesOrNull(it.maxBill, it.maxChange, it.step) }
    return QuoteView(
        subtotal = checkNotNull(sub),
        deliveryFee = checkNotNull(fee),
        nominalDeliveryFee = checkNotNull(nominal),
        freeDelivery = freeDelivery.applies,
        freeReason = freeDelivery.reason,
        far = deliveryBand == "far",
        total = checkNotNull(totalAmount),
        prepayThreshold = checkNotNull(threshold),
        options = readPayOptions(payment.options),
        cash = cashRules,
        lineTotals = lines.map { checkNotNull(it) },
    )
}
