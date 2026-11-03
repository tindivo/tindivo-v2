package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.AppError
import com.tindivo.customer.feature.cart.Cart

/** Espera entre un cambio y la cotización siguiente. Se inyecta para probar sin esperar de verdad (KT-4). */
fun interface QuoteDebounce {
    suspend fun await()
}

/** Lo que dejó una cotización. */
sealed interface QuoteOutcome {
    data class Ok(
        val view: QuoteView,
    ) : QuoteOutcome

    data object Failed : QuoteOutcome

    /** Llegó, pero un importe no tiene la forma del contrato: no se enseña ni se deja confirmar. */
    data object Invalid : QuoteOutcome
}

internal fun Cart.toBagLines(): List<BagLineUi> =
    lines.map { line ->
        BagLineUi(
            name = line.name,
            quantity = line.quantity,
            options = line.modifiers.map { "${it.groupName}: ${it.optionName}" },
            note = line.note,
        )
    }

/** Aplica una cotización: guarda los importes y concilia el pago con lo que ahora se permite (D-50). */
internal fun CheckoutUiState.withQuote(
    outcome: QuoteOutcome,
    lastIntent: String?,
): CheckoutUiState =
    when (outcome) {
        is QuoteOutcome.Ok -> {
            val pay = reconcilePayMethod(pay, lastIntent, outcome.view.options)
            copy(
                quote = outcome.view,
                quoteStatus = QuoteStatus.Ready,
                pay = pay,
                cash = if (pay == PayMethod.Cash) cash else CashChoice.None,
            )
        }

        QuoteOutcome.Failed -> {
            copy(quote = null, quoteStatus = QuoteStatus.Failed, message = CheckoutMessage.QuoteFailed)
        }

        QuoteOutcome.Invalid -> {
            copy(quote = null, quoteStatus = QuoteStatus.Invalid, message = CheckoutMessage.QuoteFailed)
        }
    }

private val BLOCKED = Regex("bloquead", RegexOption.IGNORE_CASE)
private const val FIRST_CLIENT_ERROR = 400
private const val LAST_CLIENT_ERROR = 499
private const val UNPROCESSABLE = 422

/** Lo que el servidor dice al rechazar un pedido, si es un 4xx con texto; un 5xx o un cuerpo ilegible no se enseñan. */
internal fun AppError.clientDetail(): String? =
    when (this) {
        is AppError.Known -> detail?.takeIf { status in FIRST_CLIENT_ERROR..LAST_CLIENT_ERROR }
        else -> null
    }

internal fun AppError.isBlockedAccount(): Boolean =
    when (this) {
        is AppError.Known -> detail?.let(BLOCKED::containsMatchIn) == true
        is AppError.Unknown -> detail?.let(BLOCKED::containsMatchIn) == true
        else -> false
    }

/** El 422 de un cliente sin historial que eligió efectivo: «Pago adelantado requerido para primer pedido.». */
internal fun AppError.isPrepayRequired(): Boolean =
    this is AppError.Known && status == UNPROCESSABLE && detail.orEmpty().contains("adelantado", ignoreCase = true)

/** El estado tras un rechazo del servidor al crear el pedido (la bolsa y la clave no se tocan aquí). */
internal fun CheckoutUiState.withRejection(error: AppError): CheckoutUiState {
    val base = copy(sending = false)
    return when {
        error.isBlockedAccount() -> {
            base.copy(phase = CheckoutPhase.Blocked, blockedDetail = error.clientDetail())
        }

        error is AppError.Network -> {
            base.copy(message = CheckoutMessage.Offline)
        }

        error.isPrepayRequired() -> {
            val prepaid = quote?.options?.firstOrNull { it.method == PayMethod.Prepaid && it.available }
            base.copy(
                pay = prepaid?.method,
                cash = CashChoice.None,
                message = CheckoutMessage.Server(error.clientDetail().orEmpty()),
            )
        }

        else -> {
            base.copy(message = error.clientDetail()?.let(CheckoutMessage::Server) ?: CheckoutMessage.Generic)
        }
    }
}

/** El estado tras leer perfil, direcciones y negocio: bloqueado si el servidor lo dice; si no, listo para cotizar. */
internal fun CheckoutUiState.withLoaded(
    data: CheckoutData,
    cart: Cart,
): CheckoutUiState {
    val business = data.business
    val acceptsDelivery = business?.acceptsWebDelivery ?: true
    val acceptsPickup = business?.acceptsWebPickup ?: false
    return copy(
        phase = if (data.profile.blocked) CheckoutPhase.Blocked else CheckoutPhase.Form,
        businessName = business?.name ?: cart.businessName,
        etaMin = business?.estimatedEtaMin,
        etaMax = business?.estimatedEtaMax,
        acceptsDelivery = acceptsDelivery,
        acceptsPickup = acceptsPickup,
        method = if (!acceptsDelivery && acceptsPickup) DeliveryChoice.Pickup else DeliveryChoice.Delivery,
        addresses = data.addresses,
        selectedAddressId = data.addresses.preferred()?.id,
        name = data.profile.fullName.take(MAX_NAME_LENGTH),
        phone = data.profile.phone,
        phoneVerified = data.profile.phoneVerified && data.profile.phone != null,
        lines = cart.toBagLines(),
        message = null,
    )
}
