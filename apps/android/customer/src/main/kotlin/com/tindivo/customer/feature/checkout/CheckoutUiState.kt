package com.tindivo.customer.feature.checkout

import java.math.BigDecimal

enum class CheckoutPhase {
    Loading,
    SignInRequired,
    LoadFailed,

    /** La cuenta aún no tiene perfil: falta el nombre antes de poder pedir. */
    ProfileRequired,
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
    /** La hoja abierta encima del checkout, o ninguna. */
    val sheet: CheckoutSheet? = null,
) {
    val selectedAddress: AddressUi? get() = addresses.firstOrNull { it.id == selectedAddressId }
    val isPickup: Boolean get() = method == DeliveryChoice.Pickup
    val cta: Cta get() = ctaOf(this)

    /**
     * El nombre, el celular, la nota y las direcciones son datos personales: no salen en un log. De las direcciones y
     * las líneas de la bolsa (que llevan notas escritas) solo sale cuántas hay.
     */
    override fun toString(): String =
        "CheckoutUiState(phase=$phase, businessName=$businessName, etaMin=$etaMin, etaMax=$etaMax, " +
            "acceptsDelivery=$acceptsDelivery, acceptsPickup=$acceptsPickup, method=$method, pickupWhen=$pickupWhen, " +
            "addresses=${addresses.size}, selectedAddressId=$selectedAddressId, name=***, " +
            "phone=${if (phone == null) "null" else "***"}, phoneVerified=$phoneVerified, note=***, " +
            "lines=${lines.size}, pay=$pay, cash=$cash, quote=$quote, quoteStatus=$quoteStatus, sending=$sending, " +
            "message=$message, blockedDetail=$blockedDetail, reconcileSeen=$reconcileSeen, " +
            "createdOrderId=$createdOrderId, sheet=$sheet)"
}

/**
 * Lo que falta se resuelve en una hoja encima del checkout, sin salir de él: al terminar, la hoja se cierra con el dato
 * ya aplicado. Solo hay una abierta a la vez; atrás o tocar fuera la cierran sin aplicar nada.
 */
sealed interface CheckoutSheet {
    /** Las direcciones guardadas: elegir una es un toque; desde aquí también se agrega otra. */
    data object ChooseAddress : CheckoutSheet

    data object AddAddress : CheckoutSheet

    data class EditAddress(
        val id: String,
    ) : CheckoutSheet

    data object VerifyPhone : CheckoutSheet

    /** La cuenta aún no tiene perfil: falta el nombre. */
    data object CompleteProfile : CheckoutSheet

    /** La fase del checkout en la que esta hoja tiene sentido: fuera de ella no se abre ni se aplica. */
    val phase: CheckoutPhase
        get() = if (this == CompleteProfile) CheckoutPhase.ProfileRequired else CheckoutPhase.Form
}

/**
 * La hoja que abre el botón fijo cuando dice qué falta, o `null` si lo que falta se resuelve en el propio formulario
 * (el nombre, el pago) o el botón hace otra cosa. Una dirección incompleta se corrige; sin dirección elegida, se agrega.
 */
fun Cta.sheet(selectedAddressId: String?): CheckoutSheet? =
    when (this) {
        Cta.NeedAddress -> {
            CheckoutSheet.AddAddress
        }

        Cta.NeedFixAddress, Cta.NeedReference, Cta.NeedPin -> {
            selectedAddressId?.let(CheckoutSheet::EditAddress) ?: CheckoutSheet.AddAddress
        }

        Cta.NeedPhone -> {
            CheckoutSheet.VerifyPhone
        }

        else -> {
            null
        }
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
    val exact = state.cash is CashChoice.Exact
    return checkCash(state.cash.payingWith(quote.total), quote.total, rules, exact) is CashCheck.Ok
}
