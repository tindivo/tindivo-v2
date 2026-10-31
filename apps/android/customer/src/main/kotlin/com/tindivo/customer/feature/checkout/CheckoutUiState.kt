package com.tindivo.customer.feature.checkout

import java.math.BigDecimal

enum class CheckoutPhase {
    Loading,
    SignInRequired,
    LoadFailed,
    Form,
    Blocked,
    Reconcile,

    /** El pedido ya existe y se abre su seguimiento. */
    Opening,
    EmptyBag,
}

enum class QuoteStatus { Loading, Ready, Failed, Invalid }

/** Un aviso para la barra fija. Los textos viven en `strings.xml`; aquí solo qué pasó. */
sealed interface CheckoutMessage {
    /** El texto que mandó el servidor (`detail` del Problem). */
    data class Server(
        val detail: String,
    ) : CheckoutMessage

    data object Generic : CheckoutMessage

    data object Offline : CheckoutMessage

    data object QuoteFailed : CheckoutMessage

    data object StillProcessing : CheckoutMessage

    /** El total de la cotización de ahora no es el que se enseñó: no se creó nada. */
    data class TotalChanged(
        val total: BigDecimal,
    ) : CheckoutMessage

    /** La cotización de ahora cambió lo que se podía elegir (pago o efectivo): no se creó nada. */
    data object OptionsChanged : CheckoutMessage
}

/** Una línea de la bolsa, para enseñarla. El importe sale de la cotización, no de los precios de la carta. */
data class BagLineUi(
    val name: String,
    val quantity: Int,
    val options: List<String>,
    val note: String?,
)

data class CheckoutUiState(
    val phase: CheckoutPhase = CheckoutPhase.Loading,
    val businessName: String = "",
    val etaMin: Int? = null,
    val etaMax: Int? = null,
    val acceptsDelivery: Boolean = true,
    val acceptsPickup: Boolean = false,
    val method: DeliveryChoice = DeliveryChoice.Delivery,
    val pickupWhen: PickupWhen? = null,
    val addresses: List<AddressUi> = emptyList(),
    val selectedAddressId: String? = null,
    val name: String = "",
    val phone: String? = null,
    val phoneVerified: Boolean = false,
    val note: String = "",
    val lines: List<BagLineUi> = emptyList(),
    val pay: PayMethod? = null,
    val cash: CashChoice = CashChoice.None,
    val quote: QuoteView? = null,
    val quoteStatus: QuoteStatus = QuoteStatus.Loading,
    val sending: Boolean = false,
    val message: CheckoutMessage? = null,
    val blockedDetail: String? = null,
    /** Ya abrió «Mis pedidos» desde la vista de reconciliación: recién entonces puede decir «Ya revisé». */
    val reconcileSeen: Boolean = false,
    val createdOrderId: String? = null,
) {
    val selectedAddress: AddressUi? get() = addresses.firstOrNull { it.id == selectedAddressId }
    val isPickup: Boolean get() = method == DeliveryChoice.Pickup
    val cta: Cta get() = ctaOf(this)
}

/** Qué dice y qué hace el botón fijo. */
sealed interface Cta {
    data object Sending : Cta

    data object Calculating : Cta

    data object QuoteProblem : Cta

    data object NeedName : Cta

    data object NeedPickupAnswer : Cta

    data object NeedAddress : Cta

    data object NeedFixAddress : Cta

    data object NeedReference : Cta

    data object NeedPin : Cta

    data object NeedPhone : Cta

    data object NeedPay : Cta

    data object NeedCash : Cta

    data class Ready(
        val total: BigDecimal,
    ) : Cta

    /** Solo [Ready] crea el pedido. */
    val canConfirm: Boolean get() = this is Ready

    /** Lo que falta se resuelve fuera del checkout (Mi cuenta). */
    val opensAccount: Boolean
        get() =
            this is NeedAddress || this is NeedFixAddress || this is NeedReference || this is NeedPin ||
                this is NeedPhone
}

/** Lo que falta para confirmar, en el orden de la web (`useCheckoutValidation`). */
fun ctaOf(state: CheckoutUiState): Cta {
    val quote = state.quote
    return when {
        state.sending -> Cta.Sending

        state.name.trim().isEmpty() -> Cta.NeedName

        state.isPickup && state.pickupWhen == null -> Cta.NeedPickupAnswer

        !state.isPickup && addressNeed(
            state.selectedAddress,
        ) != null -> checkNotNull(addressNeed(state.selectedAddress))

        !state.phoneVerified -> Cta.NeedPhone

        state.quoteStatus == QuoteStatus.Loading -> Cta.Calculating

        quote == null || state.quoteStatus != QuoteStatus.Ready -> Cta.QuoteProblem

        state.pay == null -> Cta.NeedPay

        state.pay == PayMethod.Cash && !cashOk(state, quote) -> Cta.NeedCash

        else -> Cta.Ready(quote.total)
    }
}

private fun addressNeed(address: AddressUi?): Cta? =
    when {
        address == null -> Cta.NeedAddress
        !address.lineOk -> Cta.NeedFixAddress
        !address.referenceOk -> Cta.NeedReference
        !address.hasLocation -> Cta.NeedPin
        else -> null
    }

private fun cashOk(
    state: CheckoutUiState,
    quote: QuoteView,
): Boolean {
    val rules = quote.cash ?: return false
    return checkCash(state.cash.payingWith(quote.total), quote.total, rules) is CashCheck.Ok
}
