package com.tindivo.customer.feature.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CheckoutRepository
import com.tindivo.customer.feature.cart.Cart
import com.tindivo.customer.feature.cart.CartStore
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import javax.inject.Inject

/**
 * El checkout «Revisar → Confirmar» (D-49). El servidor manda en todo importe: la app recotiza al cambiar la entrega,
 * la dirección o la bolsa, y otra vez justo antes de crear el pedido; si el total cambió, no crea nada y pide
 * confirmar de nuevo. El pedido sale por [OrderAttemptLedger], que decide si se envía, con qué clave y cuándo hay
 * que pedirle a la persona que revise «Mis pedidos».
 */
@HiltViewModel
class CheckoutViewModel
    @Inject
    constructor(
        private val loader: CheckoutLoader,
        private val checkout: CheckoutRepository,
        private val cartStore: CartStore,
        private val ledger: OrderAttemptLedger,
        private val sessionStore: SessionStore,
        private val debounce: QuoteDebounce,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(CheckoutUiState())
        val state: StateFlow<CheckoutUiState> = mutableState.asStateFlow()

        private var cart: Cart? = null
        private var accountId: String? = null
        private var lastIntent: String? = null
        private var loadedFor: String? = null
        private var lastFingerprint: String? = null
        private var quoteJob: Job? = null

        init {
            viewModelScope.launch { sessionStore.state.collect { onSession(it) } }
            viewModelScope.launch { cartStore.cart.collect { onCart(it) } }
        }

        private fun onSession(session: SessionState) {
            when (session) {
                SessionState.Unknown -> {
                    Unit
                }

                SessionState.SignedOut -> {
                    accountId = null
                    loadedFor = null
                    if (mutableState.value.phase != CheckoutPhase.Opening) {
                        mutableState.update { it.copy(phase = CheckoutPhase.SignInRequired) }
                    }
                }

                is SessionState.SignedIn -> {
                    accountId = session.userId
                    startIfReady()
                }
            }
        }

        private fun onCart(current: Cart?) {
            cart = current
            if (current == null || current.isEmpty()) {
                if (mutableState.value.phase != CheckoutPhase.Opening) {
                    mutableState.update { it.copy(phase = CheckoutPhase.EmptyBag) }
                }
                return
            }
            mutableState.update { it.copy(lines = current.toBagLines()) }
            val changed = lastFingerprint != null && lastFingerprint != current.fingerprint()
            lastFingerprint = current.fingerprint()
            if (changed && mutableState.value.phase == CheckoutPhase.Form) requote(debounced = true)
            startIfReady()
        }

        private fun startIfReady() {
            val account = accountId
            val current = cart
            if (account == null || current == null || current.isEmpty() || loadedFor == account) return
            loadedFor = account
            load(current)
        }

        /** Vuelve a leer perfil, direcciones y negocio (después de un fallo). */
        fun retryLoad() {
            val current = cart ?: return
            load(current)
        }

        private fun load(current: Cart) {
            mutableState.update { it.copy(phase = CheckoutPhase.Loading) }
            viewModelScope.launch {
                when (val outcome = loader.load(current.businessId)) {
                    is LoadOutcome.Failed -> {
                        mutableState.update { it.copy(phase = CheckoutPhase.LoadFailed) }
                    }

                    is LoadOutcome.Loaded -> {
                        lastIntent = outcome.data.lastIntent
                        mutableState.update { it.withLoaded(outcome.data, current) }
                        if (mutableState.value.phase == CheckoutPhase.Form) requote(debounced = false)
                    }
                }
            }
        }

        fun setMethod(method: DeliveryChoice) {
            val current = mutableState.value
            val allowed = if (method == DeliveryChoice.Pickup) current.acceptsPickup else current.acceptsDelivery
            if (!allowed || current.method == method) return
            edit { copy(method = method, pay = null, cash = CashChoice.None) }
            requote(debounced = true)
        }

        fun setPickupWhen(choice: PickupWhen) {
            edit { copy(pickupWhen = choice) }
            requote(debounced = true)
        }

        fun selectAddress(id: String) {
            edit { copy(selectedAddressId = id) }
            requote(debounced = true)
        }

        fun setName(text: String) = edit { copy(name = text.take(MAX_NAME_LENGTH)) }

        fun setNote(text: String) = edit { copy(note = text.take(MAX_DRIVER_NOTE_LENGTH)) }

        /** Solo se puede elegir lo que la cotización marca como disponible. */
        fun selectPay(method: PayMethod) {
            val allowed =
                mutableState.value.quote
                    ?.options
                    ?.any { it.method == method && it.available } == true
            if (allowed) edit { copy(pay = method, cash = if (method == PayMethod.Cash) cash else CashChoice.None) }
        }

        fun selectCash(choice: CashChoice) = edit { copy(cash = choice) }

        fun retryQuote() = requote(debounced = false)

        private inline fun edit(change: CheckoutUiState.() -> CheckoutUiState) =
            mutableState.update { it.change().copy(message = null) }

        private fun requote(debounced: Boolean) {
            quoteJob?.cancel()
            mutableState.update { it.copy(quoteStatus = QuoteStatus.Loading) }
            quoteJob =
                viewModelScope.launch {
                    if (debounced) debounce.await()
                    val outcome = fetchQuote()
                    mutableState.update { it.withQuote(outcome, lastIntent) }
                }
        }

        private suspend fun fetchQuote(): QuoteOutcome {
            val current = cart ?: return QuoteOutcome.Failed
            val request = buildQuoteRequest(mutableState.value, current) ?: return QuoteOutcome.Invalid
            return when (val result = checkout.quote(request)) {
                is ApiResult.Failure -> QuoteOutcome.Failed
                is ApiResult.Success -> result.data.toQuoteViewOrNull()?.let(QuoteOutcome::Ok) ?: QuoteOutcome.Invalid
            }
        }

        /** El botón fijo. Un segundo toque mientras se envía no hace nada (además del `Busy` del libro). */
        fun confirm() {
            val current = mutableState.value
            if (current.phase != CheckoutPhase.Form || current.sending || !current.cta.canConfirm) return
            // La cuenta se captura UNA vez aqui y firma el pedido hasta el POST: la sesion no se vuelve a leer.
            val account = accountId
            mutableState.update { it.copy(sending = true, message = null) }
            viewModelScope.launch { submit(account) }
        }

        private suspend fun submit(account: String?) {
            quoteJob?.cancel()
            val shown = mutableState.value.quote?.total
            val outcome = fetchQuote()
            val fresh = (outcome as? QuoteOutcome.Ok)?.view
            if (fresh == null) {
                mutableState.update { it.withQuote(outcome, lastIntent).copy(sending = false) }
                return
            }
            val before = mutableState.value
            val next = before.withQuote(outcome, lastIntent)
            mutableState.value = next
            val ready = next.copy(sending = false).cta.canConfirm
            when {
                shown == null || fresh.total.compareTo(shown) != 0 -> stop(CheckoutMessage.TotalChanged(fresh.total))
                next.pay != before.pay || !ready -> stop(CheckoutMessage.OptionsChanged)
                else -> place(account, next, fresh)
            }
        }

        private fun stop(message: CheckoutMessage) = mutableState.update { it.copy(sending = false, message = message) }

        private suspend fun place(
            account: String?,
            form: CheckoutUiState,
            quote: QuoteView,
        ) {
            val current = cart
            val request = if (current == null) null else buildOrderRequest(form, current, quote)
            if (account == null || current == null || request == null) {
                stop(CheckoutMessage.Generic)
                return
            }
            when (val result = ledger.place(account, current) { key -> checkout.createOrder(request, key, account) }) {
                is PlaceResult.Created -> {
                    opened(result.data.id.toString())
                }

                is PlaceResult.AlreadyCreated -> {
                    opened(result.order.id)
                }

                is PlaceResult.Failed -> {
                    failed(result)
                }

                PlaceResult.Busy -> {
                    mutableState.update { it.copy(sending = false) }
                }

                PlaceResult.StillProcessing -> {
                    stop(CheckoutMessage.StillProcessing)
                }

                PlaceResult.NeedsReconciliation -> {
                    mutableState.update {
                        it.copy(phase = CheckoutPhase.Reconcile, sending = false, reconcileSeen = false)
                    }
                }
            }
        }

        private fun failed(result: PlaceResult.Failed) {
            mutableState.update { it.withRejection(result.error) }
            val rejected = result.error.clientDetail() != null
            if (rejected && mutableState.value.phase == CheckoutPhase.Form) requote(debounced = false)
        }

        // El pedido existe: la fase cambia ANTES de vaciar la bolsa para que el aviso de «bolsa vacía» no parpadee.
        private suspend fun opened(orderId: String) {
            mutableState.update { it.copy(phase = CheckoutPhase.Opening, createdOrderId = orderId, sending = false) }
            try {
                cartStore.clear()
            } catch (ignored: IOException) {
                // El pedido ya está creado; si la bolsa no se pudo vaciar, se vacía la próxima vez que se abra.
            }
        }

        /** La persona abrió «Mis pedidos» desde la vista de reconciliación. */
        fun ordersOpened() = mutableState.update { it.copy(reconcileSeen = true) }

        /** «Ya revisé, hacer este pedido»: olvida el intento anterior y vuelve a intentar UNA vez. */
        fun acknowledgeAndRetry() {
            val account = accountId
            if (account == null || !mutableState.value.reconcileSeen || mutableState.value.sending) return
            mutableState.update { it.copy(phase = CheckoutPhase.Form, sending = true, message = null) }
            viewModelScope.launch {
                ledger.acknowledgeReconciled(account)
                submit(account)
            }
        }
    }
