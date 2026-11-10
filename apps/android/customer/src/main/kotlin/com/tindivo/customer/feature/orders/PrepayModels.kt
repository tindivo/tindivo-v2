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
 */
internal data class PrepayDetails(
    val businessName: String,
    val payee: PrepayPayee?,
    val lastTry: Boolean,
    val deadline: Instant?,
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

/** Por qué no se pudo enviar el comprobante, y qué se le ofrece a la persona. */
internal sealed interface SendProblem {
    /** Sin conexión o corte: se conserva la foto y se puede reintentar. */
    data object Offline : SendProblem

    /** La foto no se pudo leer como imagen: hay que elegir otra. */
    data object Unreadable : SendProblem

    data object TooLarge : SendProblem

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
 * La sección «Paga tu pedido». [photo] es el `Uri` (en texto) de la foto elegida. [refreshRequests] sube cada vez que
 * el detalle del pedido debe volver a consultarse (el comprobante llegó, o el servidor dijo que el estado cambió).
 */
internal data class PrepayUiState(
    val info: PrepayInfoState = PrepayInfoState.Idle,
    val countdown: PrepayCountdown? = null,
    val photo: String? = null,
    val send: SendState = SendState.Idle,
    val refreshRequests: Int = 0,
) {
    /** Se puede tocar «Enviar comprobante». */
    val canSend: Boolean
        get() =
            info is PrepayInfoState.Ready &&
                photo != null &&
                send !is SendState.Sending &&
                send !is SendState.Sent &&
                countdown != PrepayCountdown.Expired

    /** Se ofrece elegir la captura y enviarla: ni ya enviada (no se reemplaza) ni con el plazo vencido. */
    val showsProofPicker: Boolean
        get() = send !is SendState.Sent && countdown != PrepayCountdown.Expired
}

/** Lo que la sección puede pedirle a su ViewModel. */
internal data class PrepayActions(
    val load: () -> Unit = {},
    val retryInfo: () -> Unit = {},
    val onPhotoPicked: (String?) -> Unit = {},
    val send: () -> Unit = {},
)

private const val AWAITING_PAYMENT = "awaiting_payment"
private const val MILLIS_PER_MINUTE = 60_000L

/**
 * Lo que se muestra de `prepay-info`. [paymentMinutes] es el plazo de `app_settings.timers` (`GET /public/config`); la
 * hora de inicio es `awaitingPaymentAt`, que hoy es `orders.updated_at` (lo dice el contrato). Ninguna fecha ilegible
 * se reemplaza por otra: sin una de las dos no hay cuenta regresiva.
 */
internal fun GetPrepayInfo200ResponseData.toPrepayState(paymentMinutes: Int?): PrepayInfoState {
    if (status != AWAITING_PAYMENT) return PrepayInfoState.NotAwaiting
    val started = awaitingPaymentAt?.let(::apiInstantOrNull)
    val deadline = paymentMinutes?.let { started?.plus(Duration.ofMinutes(it.toLong())) }
    val qr = paymentQr
    val fallbackNumber = yapeNumber
    val payee =
        when {
            qr != null -> PrepayPayee(walletOf(qr.wallet), qr.accountNumber, qr.accountName.ifBlank { null }, qr.qrUrl)
            fallbackNumber != null -> PrepayPayee(wallet = null, fallbackNumber, accountName = null, qrUrl)
            else -> null
        }
    return PrepayInfoState.Ready(
        PrepayDetails(businessName = businessName, payee = payee, lastTry = proofAttempt == 1, deadline = deadline),
    )
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
