package com.tindivo.customer.feature.orders

import java.util.UUID

/** Lo que dice el título grande de un pedido en curso o entregado (textos literales de la web). */
internal enum class OrderHero {
    Received,
    AwaitingAvailability,
    PayNow,
    VerifyingProof,
    PaymentVerified,
    Preparing,
    OnTheWay,
    ReadyForPickup,
    Delivered,
    Unknown,
}

/** Qué título y subtítulo lleva un pedido cancelado, según su `cancelReason` (y el método, para `no_show`). */
internal enum class CancelCopy {
    CustomerCancelled,
    PrepayTimeout,
    CouldNotConfirm,
    BusinessCancelled,
    AdminCancelled,
    ProofRejected,
    PickupNoShow,
    DeliveryNoShow,
    Generic,
}

/** Lo que el titular necesita saber del pago de un pedido. */
internal data class PaymentFacts(
    val prepaid: Boolean,
    /**
     * Hubo un comprobante real (`proofAttempt >= 1`, migración 0095). Hace las veces del `proofUrl` de la web, que la
     * API REST no expone. Tras un rechazo sigue en `true`: así la app nunca dice «sin costo» a quien pudo haber pagado.
     */
    val proofSent: Boolean,
    val verified: Boolean,
) {
    /** Lo que la web llama `yaPago` en `cancelledCopy`. */
    val alreadyPaid: Boolean get() = prepaid && (proofSent || verified)
}

internal sealed interface OrderHeadline {
    data class Progress(
        val hero: OrderHero,
    ) : OrderHeadline

    /**
     * [alreadyPaid]: es prepago y ya mandó comprobante o se verificó su pago. Entonces la web no dice «sin costo» ni
     * «no se te cobró nada»: pide escribir por WhatsApp para coordinar el dinero.
     */
    data class Cancelled(
        val copy: CancelCopy,
        val alreadyPaid: Boolean = false,
    ) : OrderHeadline
}

/** Una tarjeta del historial. Los importes ya son texto de pantalla; [total] es el campo `total` de la API. */
internal data class OrderCardUi(
    val id: UUID,
    val shortId: String,
    val businessName: String?,
    val phase: OrderPhase,
    val isPickup: Boolean,
    val itemsSummary: String,
    val createdAt: RelativeDate,
    val total: String,
)

internal data class OrdersPageUi(
    val items: List<OrderCardUi>,
    val nextCursor: String?,
)

/** Una opción elegida de un plato; [extra] solo viene si cuesta algo (`+S/ 2.50`). */
internal data class OrderOptionUi(
    val group: String,
    val name: String,
    val extra: String?,
)

internal data class OrderLineUi(
    val quantity: Int,
    val name: String,
    val note: String?,
    val lineTotal: String,
    val options: List<OrderOptionUi>,
)

/** El vuelto que pide quien paga en efectivo: un importe, o «importe exacto». */
internal sealed interface CashChange {
    data class Amount(
        val text: String,
    ) : CashChange

    data object Exact : CashChange
}

internal data class CashPaymentUi(
    val paysWith: String,
    val change: CashChange,
)

/**
 * El motorizado. [name] solo llega cuando ya es asunto del cliente; [atDoor] es que llegó a la puerta y el pedido no
 * se ha entregado, y solo entonces puede haber [whatsappLink]. El teléfono no se guarda ni se muestra nunca como texto.
 */
internal data class DriverUi(
    val name: String?,
    val atDoor: Boolean,
    val whatsappLink: String?,
)

internal data class OrderDetailUi(
    val id: UUID,
    val shortId: String,
    val businessName: String?,
    val phase: OrderPhase,
    val headline: OrderHeadline,
    val isPickup: Boolean,
    val lines: List<OrderLineUi>,
    val deliveryFee: String,
    val total: String,
    /** «Total pagado» en vez de «Total»: solo con el pago ya verificado, nunca por haber subido un comprobante. */
    val totalPaid: Boolean,
    val cash: CashPaymentUi?,
    val address: String?,
    val reference: String?,
    val customerNotes: String?,
    val driver: DriverUi?,
    /** `true` si para pagar o apelar hay que abrir el pedido en la web (la app aún no sube comprobantes). */
    val webPaymentNotice: Boolean,
)
