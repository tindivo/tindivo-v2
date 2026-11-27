package com.tindivo.customer.feature.orders

import com.tindivo.core.network.AppError
import com.tindivo.core.network.generated.model.GetPrepayInfo200ResponseData
import java.time.Duration
import java.time.Instant

/** La billetera de la cuenta del negocio; [Other] es una que esta versión no conoce (CLI-2). */
internal enum class PayWallet { Yape, Plin, Other }

/** A quién se le paga. [qrUrl] es la imagen del QR, si el negocio la subió. */
internal data class PrepayPayee(
    val wallet: PayWallet?,
    val accountNumber: String,
    val accountName: String?,
    val qrUrl: String?,
)

/**
 * Lo que la sección de pago necesita del servidor. [deadline] es cuándo vence el plazo para pagar, o `null` si no se
 * sabe (sin la hora o sin los minutos del plazo): entonces no se pinta una cuenta regresiva inventada.
 * [lastTry]: ya se rechazó un comprobante y queda un solo intento.
 *
 * Pago único con captura opcional (`proofOptional`): [optional] es ese modo (no tiene plazo: [deadline] va en `null`);
 * [canUpload] es `canUploadProof`, lo que el servidor deja hacer; [proofInReview], que ya hay una captura pendiente
 * de revisión; [paymentConfirmed], que el negocio ya confirmó el pago. La app no lo deduce del estado del pedido.
 */
internal data class PrepayDetails(
    val businessName: String,
    val payee: PrepayPayee?,
    val lastTry: Boolean,
    val deadline: Instant?,
    val optional: Boolean = false,
    val canUpload: Boolean = true,
    val proofInReview: Boolean = false,
    val paymentConfirmed: Boolean = false,
)

internal sealed interface PrepayInfoState {
    /** Todavía no se pidió (el pedido no espera pago) o la sesión se cerró. */
    data object Idle : PrepayInfoState

    data object Loading : PrepayInfoState

    data class Failed(
        val error: AppError,
    ) : PrepayInfoState

    /** El servidor dice que el pedido ya no espera el comprobante: la sección no ofrece subir nada. */
    data object NotAwaiting : PrepayInfoState

    data class Ready(
        val details: PrepayDetails,
    ) : PrepayInfoState
}

/** El tiempo que queda para pagar, en minutos enteros redondeados hacia arriba. */
internal sealed interface PrepayCountdown {
    data class Remaining(
        val minutes: Long,
    ) : PrepayCountdown

    data object Expired : PrepayCountdown
}

private const val URGENT_BELOW_MINUTES = 3

/** Se ve «Te quedan 2 min» o menos: la pastilla se pone roja. El tiempo vencido tiene su propio aviso. */
internal val PrepayCountdown.isUrgent: Boolean
    get() = this is PrepayCountdown.Remaining && minutes < URGENT_BELOW_MINUTES

/**
 * El monto tal como se pega en Yape o Plin: solo el número con punto decimal. [amount] llega del servidor ya con
 * «S/» (y, si pasa de mil, con coma de miles); la app no calcula ni redondea nada.
 */
internal fun amountToCopy(amount: String): String = amount.filter { it.isDigit() || it == '.' }

/** Por qué no se pudo enviar el comprobante, y qué se le ofrece a la persona. */
internal sealed interface SendProblem {
    /** Sin conexión o corte: se conserva la foto y se puede reintentar. */
    data object Offline : SendProblem

    /** La foto no se pudo leer como imagen: hay que elegir otra. */
    data object Unreadable : SendProblem

    data object TooLarge : SendProblem

    /** Un HEIC en Android 8, que no lo decodifica: se pide una captura de pantalla (CUS-PAY-003). */
    data object HeicUnsupported : SendProblem

    /** El servidor lo rechazó y lo explicó ([detail] es su texto, si lo trae). */
    data class Rejected(
        val detail: String?,
    ) : SendProblem

    /** Algo que no se pudo leer o no se esperaba. */
    data object Generic : SendProblem
}

internal sealed interface SendState {
    data object Idle : SendState

    data object Sending : SendState

    data object Sent : SendState

    data class Failed(
        val problem: SendProblem,
    ) : SendState
}

/**
 * La sección «Paga tu pedido». [photo] es el `Uri` (en texto) de la foto elegida; `toString` no lo muestra.
 * [refreshRequests] sube cada vez que el detalle del pedido debe volver a consultarse (el comprobante llegó, o el
 * servidor dijo que el estado cambió).
 */
internal data class PrepayUiState(
    val info: PrepayInfoState = PrepayInfoState.Idle,
    val countdown: PrepayCountdown? = null,
    val photo: String? = null,
    val send: SendState = SendState.Idle,
    val refreshRequests: Int = 0,
    /** Se está releyendo `prepay-info` tras un envío incierto o un 409: hasta que llegue no hay selector ni envío. */
    val reconciling: Boolean = false,
) {
    /** Se puede tocar «Enviar comprobante». */
    val canSend: Boolean
        get() =
            info is PrepayInfoState.Ready &&
                info.details.allowsProof &&
                !reconciling &&
                photo != null &&
                send !is SendState.Sending &&
                send !is SendState.Sent &&
                countdown != PrepayCountdown.Expired

    /**
     * Se ofrece elegir la captura y enviarla: solo con la oferta de pago a la vista (sin ella no hay nada que pagar,
     * CAX-002), ni ya enviada (no se reemplaza) ni con el plazo vencido.
     */
    val showsProofPicker: Boolean
        get() =
            info is PrepayInfoState.Ready &&
                info.details.allowsProof &&
                !reconciling &&
                send !is SendState.Sent &&
                countdown != PrepayCountdown.Expired

    /** La tarjeta de pago opcional: con la carga fallida (para poder reintentar) o con el modo opcional ya leído. */
    val showsOptionalCard: Boolean
        get() = info is PrepayInfoState.Failed || (info is PrepayInfoState.Ready && info.details.optional)

    /** Sin el `Uri` de la foto: dice si hay una elegida, no cuál (CAX-003). */
    override fun toString(): String =
        "PrepayUiState(info=$info, countdown=$countdown, photo=${photo?.let { REDACTED }}, send=$send, " +
            "refreshRequests=$refreshRequests, reconciling=$reconciling)"
}

/** El servidor deja subir captura, y no hay ya una en revisión ni el pago confirmado. */
private val PrepayDetails.allowsProof: Boolean
    get() = canUpload && !proofInReview && !paymentConfirmed

/** Lo que se muestra en `toString` en lugar de un `Uri`, una ruta del bucket o una URL firmada. */
internal const val REDACTED = "***"

/** Lo que la sección puede pedirle a su ViewModel. */
internal data class PrepayActions(
    val load: () -> Unit = {},
    val retryInfo: () -> Unit = {},
    val onPhotoPicked: (String?) -> Unit = {},
    val send: () -> Unit = {},
)

private const val AWAITING_PAYMENT = "awaiting_payment"
private const val PENDING = "pending"
private const val REJECTED = "rejected"

/** El pedido ya terminó: no queda nada que pagar, ni siquiera «al motorizado» (CAX-002). */
private val FINISHED_STATUSES = setOf("cancelled", "delivered")
private const val MILLIS_PER_MINUTE = 60_000L

/**
 * Lo que se muestra de `prepay-info`. [paymentMinutes] es el plazo de `app_settings.timers` (`GET /public/config`); la
 * hora de inicio es `awaitingPaymentAt`, que hoy es `orders.updated_at` (lo dice el contrato). Ninguna fecha ilegible
 * se reemplaza por otra: sin una de las dos no hay cuenta regresiva.
 */
internal fun GetPrepayInfo200ResponseData.toPrepayState(paymentMinutes: Int?): PrepayInfoState {
    if (proofOptional) return if (status in FINISHED_STATUSES) PrepayInfoState.NotAwaiting else optionalState()
    if (status != AWAITING_PAYMENT || !canUploadProof) return PrepayInfoState.NotAwaiting
    val started = awaitingPaymentAt?.let(::apiInstantOrNull)
    val deadline = paymentMinutes?.let { started?.plus(Duration.ofMinutes(it.toLong())) }
    return PrepayInfoState.Ready(
        PrepayDetails(businessName = businessName, payee = payee(), lastTry = proofAttempt == 1, deadline = deadline),
    )
}

/**
 * El pago único con captura opcional: sin plazo (no hay cancelación por falta de pago) y con lo que dice el servidor
 * de lo que se puede hacer, la revisión y la confirmación.
 */
private fun GetPrepayInfo200ResponseData.optionalState(): PrepayInfoState.Ready =
    PrepayInfoState.Ready(
        PrepayDetails(
            businessName = businessName,
            payee = payee(),
            lastTry = canUploadProof && proofAttempt == 1 && paymentProofStatus == REJECTED,
            deadline = null,
            optional = true,
            canUpload = canUploadProof,
            // Un ingreso ya confirmado nunca está «en revisión», diga lo que diga el estado de la captura.
            proofInReview = paymentProofStatus == PENDING && paymentVerifiedAt == null,
            paymentConfirmed = paymentVerifiedAt != null,
        ),
    )

private fun GetPrepayInfo200ResponseData.payee(): PrepayPayee? {
    val qr = paymentQr
    val fallbackNumber = yapeNumber
    return when {
        qr != null -> PrepayPayee(walletOf(qr.wallet), qr.accountNumber, qr.accountName.ifBlank { null }, qr.qrUrl)
        fallbackNumber != null -> PrepayPayee(wallet = null, fallbackNumber, accountName = null, qrUrl)
        else -> null
    }
}

private fun walletOf(wire: String): PayWallet =
    when (wire) {
        "yape" -> PayWallet.Yape
        "plin" -> PayWallet.Plin
        else -> PayWallet.Other
    }

/** Cuánto falta para [deadline] visto desde [now]: minutos redondeados hacia arriba, o vencido. */
internal fun countdownAt(
    deadline: Instant,
    now: Instant,
): PrepayCountdown {
    val millis = Duration.between(now, deadline).toMillis()
    if (millis <= 0) return PrepayCountdown.Expired
    return PrepayCountdown.Remaining((millis + MILLIS_PER_MINUTE - 1) / MILLIS_PER_MINUTE)
}

/** Cuánto falta para que cambie lo que dice [countdownAt]: el próximo minuto entero, o el vencimiento. */
internal fun millisUntilNextChange(
    deadline: Instant,
    now: Instant,
): Long {
    val millis = Duration.between(now, deadline).toMillis()
    val rest = millis % MILLIS_PER_MINUTE
    return if (rest == 0L) MILLIS_PER_MINUTE else rest
}
