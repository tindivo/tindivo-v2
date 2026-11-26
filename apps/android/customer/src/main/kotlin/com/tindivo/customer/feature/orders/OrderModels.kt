package com.tindivo.customer.feature.orders

import java.time.Instant
import java.util.UUID

/** Lo que dice el título grande de un pedido en curso o entregado (textos literales de la web). */
internal enum class OrderHero {
    Received,

    /** Paga al recibir y la cajera tiene que llamar antes (`validando`): «Te llamaremos» (CUS-CHK-027). */
    CallToConfirm,
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
    PrepayProofNotReviewed,
    PrepayProofRejected,
    BusinessNoResponse,
    CouldNotConfirm,
    BusinessCancelled,
    AdminCancelled,
    ProofRejected,
    PickupNoShow,
    DeliveryNoShow,
    Generic,
}

/** Estado del comprobante de pago que dice la API; lo desconocido no se representa (se trata como sin dato). */
internal enum class ProofStatus {
    Pending,
    Verified,
    Rejected,
    ;

    companion object {
        fun fromApi(value: String?): ProofStatus? =
            when (value) {
                "pending" -> Pending
                "verified" -> Verified
                "rejected" -> Rejected
                else -> null
            }
    }
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
    /**
     * `paymentProofStatus` del detalle: `pending`, `verified`, `rejected` o `null` (sin comprobante). El enum es abierto:
     * un valor que esta versión no conoce llega como `null`, nunca rompe.
     */
    val proofStatus: ProofStatus? = null,
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
        /** El pedido era prepago: Tindivo no ve el dinero que pudo salir por fuera, así que nunca se dice «no se cobró». */
        val prepaid: Boolean = false,
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
    /** El negocio del pedido: «Volver a pedir» abre su carta, como la web. */
    val businessId: UUID,
    /** «Volver a pedir» se ofrece siempre, salvo con el comprobante rechazado del todo (`proof_rejected_final`). */
    val reorderable: Boolean,
    /** Prepago esperando el pago: en la portada es «Falta tu pago», no «Pedido en curso». */
    val awaitingPayment: Boolean = false,
    /** Cancelado por `proof_rejected_final`: la fila ofrece «Ver caso de pago» (CUS-ORD-003). */
    val paymentCase: Boolean = false,
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
 * El motorizado: solo su nombre completo y si llegó a la puerta con el pedido sin entregar (CUS-TRK-021). El cliente no
 * recibe ni usa su teléfono, su WhatsApp ni su placa. Su `toString` no lleva el nombre: el detalle que lo contiene tampoco.
 */
internal data class DriverUi(
    val name: String,
    val atDoor: Boolean,
) {
    override fun toString(): String = "DriverUi(atDoor=$atDoor)"
}

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
    /**
     * Comprobante rechazado del todo (`proof_rejected_final`): la app no apela; el detalle manda a WhatsApp de soporte
     * con el código del pedido (decisión de Jesús, 2026-11-10).
     */
    val appealViaSupport: Boolean,
    /** Prepago esperando el pago: el detalle muestra «Paga tu pedido» para subir el comprobante. */
    val awaitingPrepayment: Boolean = false,
    /** Si el detalle ofrece cancelar y con qué aviso ([cancelOfferOf]). */
    val cancel: CancelOffer = CancelOffer.None,
    /** Espera a que el negocio acepte (`pending_acceptance`): se enseña la espera con su cuenta atrás. */
    val waitingForBusiness: Boolean = false,
    val etaStage: EtaStage = EtaStage.InProgress,
    /** Desde cuándo espera al negocio (`pendingAcceptanceAt`); `null` si el servidor no lo manda. */
    val pendingAcceptanceAt: Instant? = null,
    val estimatedReadyAt: Instant? = null,
    val travel: TravelRange? = null,
)

/**
 * Si el detalle ofrece cancelar, y con qué aviso de dinero. Dice lo mismo que `isCancellable` de la web y que la RPC
 * `cancel_customer_order` (0169); de todos modos manda el servidor, que puede responder que ya no se puede.
 */
internal enum class CancelOffer {
    None,

    /** Paga al recibir (`validando` o `pending_acceptance`): «No se te cobrará nada». */
    PayOnDelivery,

    /** Prepago antes de que el negocio acepte y sin pago a la vista: «Todavía no has pagado nada…». */
    Prepaid,

    /**
     * Prepago en la ventana, pero con comprobante enviado o pago verificado: pudo haber dinero de por medio, así que la
     * app nunca dice «sin costo» ni «no se te cobrará»; para cancelar, WhatsApp de soporte.
     */
    ViaSupport,
}
