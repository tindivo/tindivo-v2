package com.tindivo.customer.feature.orders

import java.util.UUID

/** Lo que dice el título grande de un pedido en curso o entregado (textos literales de la web). */
internal enum class OrderHero {
    Received,
    AwaitingAvailability,
    PayNow,
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

internal sealed interface OrderHeadline {
    data class Progress(
        val hero: OrderHero,
    ) : OrderHeadline

    data class Cancelled(
        val copy: CancelCopy,
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
 * El motorizado. [name] solo llega cuando ya es asunto del cliente; [whatsappLink] solo con el motorizado en la
 * puerta. El teléfono no se guarda ni se muestra nunca como texto.
 */
internal data class DriverUi(
    val name: String?,
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
    val cash: CashPaymentUi?,
    val address: String?,
    val reference: String?,
    val customerNotes: String?,
    val driver: DriverUi?,
    /** `true` si para pagar o apelar hay que abrir el pedido en la web (la app aún no sube comprobantes). */
    val webPaymentNotice: Boolean,
)
