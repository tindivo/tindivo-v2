package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.generated.model.QuoteCheckout200ResponseDataPaymentOptionsInner

/**
 * Los métodos de pago que esta versión sabe ofrecer, con el valor de `paymentIntent` del contrato. `pending_mixed`
 * existe en el contrato pero la cotización no lo ofrece: no se pinta.
 */
enum class PayMethod(
    val wire: String,
) {
    /** Efectivo al motorizado, en la puerta. */
    Cash("pending_cash"),

    /** Yape o Plin al motorizado, en la puerta. */
    Yape("pending_yape"),

    /** Yape o Plin al negocio, apenas confirme. */
    Prepaid("prepaid"),
    ;

    companion object {
        /** `null` para un valor que esta versión no conoce (el contrato avisa de que puede llegar uno nuevo). */
        fun fromWire(value: String?): PayMethod? = entries.firstOrNull { it.wire == value }
    }
}

/** Una opción de `payment.options` de la cotización, ya leída. */
data class PayOption(
    val method: PayMethod,
    val available: Boolean,
    /** Texto del contrato (`prepay_required`, `exceeds_threshold`…); `null` si está disponible. */
    val unavailableReason: String?,
)

/**
 * Las opciones de la cotización que esta versión sabe pintar, en el orden del servidor. Una opción con un `intent`
 * desconocido se descarta: ofrecerla sería mandar un valor que la app no sabe explicar.
 */
fun readPayOptions(options: List<QuoteCheckout200ResponseDataPaymentOptionsInner>): List<PayOption> =
    options.mapNotNull { option ->
        PayMethod.fromWire(option.intent)?.let {
            PayOption(it, option.available, if (option.available) null else option.unavailableReason)
        }
    }

/**
 * El método que se preselecciona (D-50): el del último pedido, si la cotización de ahora lo permite; si solo hay uno
 * disponible, ese; si no, ninguno y la persona elige. Nunca preselecciona algo que la cotización no deja usar: si el
 * cliente ya no puede pagar contra entrega, no se le pone.
 *
 * @param lastIntent `paymentIntent` del pedido más reciente de `GET /customer/orders`, o `null` si no hay.
 */
fun defaultPayMethod(
    lastIntent: String?,
    options: List<PayOption>,
): PayMethod? {
    val available = options.filter { it.available }.map { it.method }
    val last = PayMethod.fromWire(lastIntent)
    return when {
        last != null && last in available -> last
        available.size == 1 -> available.single()
        else -> null
    }
}

/**
 * Lo elegido tras una cotización nueva: se conserva si sigue disponible; si no, vuelve al valor por defecto. Así una
 * cotización que deja de permitir el efectivo (el total pasó del umbral) no deja la elección vieja puesta.
 */
fun reconcilePayMethod(
    chosen: PayMethod?,
    lastIntent: String?,
    options: List<PayOption>,
): PayMethod? =
    if (chosen != null && options.any { it.method == chosen && it.available }) {
        chosen
    } else {
        defaultPayMethod(lastIntent, options)
    }
