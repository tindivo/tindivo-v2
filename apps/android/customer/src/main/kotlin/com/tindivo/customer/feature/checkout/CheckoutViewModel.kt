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
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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

        /**
         * Cambia con cada cierre o cambio de cuenta. La carga, las cotizaciones y el envío anotan la que vieron al
         * empezar y, antes de publicar cualquier resultado, comprueban que sigue siendo la misma cuenta: si no, lo
         * descartan.
         */
        private var generation = 0
        private var quoteJob: Job? = null
        private var loadJob: Job? = null
        private var submitJob: Job? = null

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
                    clearAccountState(signedOut = true)
                }

                is SessionState.SignedIn -> {
                    val previous = accountId
                    accountId = session.userId
                    // De una cuenta a otra sin pasar por la salida: lo de la anterior no se queda ni se publica.
                    if (previous != null && previous != session.userId) clearAccountState(signedOut = false)
                    startIfReady()
                }
            }
        }

        /**
         * Sigue siendo la misma cuenta: la generación no cambió Y la sesión vigente, leída ahora, es la de [account].
         * La generación sola no basta: solo cambia cuando el colector procesa la sesión, y la continuación de una
         * respuesta ya terminada puede correr antes que el colector.
         */
        private fun isCurrent(
            started: Int,
            account: String,
        ) = started == generation && (sessionStore.state.value as? SessionState.SignedIn)?.userId == account

        /**
         * Cancela la carga y la cotización (no crean nada) y deja solo las líneas de la bolsa, que son del dispositivo.
         * El envío NO se cancela: si el POST ya salió, el pedido existe y hay que dejar que termine para vaciar la
         * bolsa; su resultado no se publica porque [isCurrent] ya no se cumple.
         */
        private fun clearAccountState(signedOut: Boolean) {
            generation++
            quoteJob?.cancel()
            quoteJob = null
            loadJob?.cancel()
            loadJob = null
            submitJob?.cancel()
            submitJob = null
            lastIntent = null
            loadedFor = null
            val empty = cart?.isEmpty() != false
            mutableState.update {
                CheckoutUiState(
                    phase =
                        when {
                            signedOut -> CheckoutPhase.SignInRequired
                            empty -> CheckoutPhase.EmptyBag
                            else -> CheckoutPhase.Loading
                        },
                    lines = if (empty) emptyList() else it.lines,
                )
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
            load(current, account)
        }

        /** Vuelve a leer perfil, direcciones y negocio (después de un fallo). */
        fun retryLoad() {
            val current = cart ?: return
            val account = accountId ?: return
            load(current, account)
        }

        private fun load(
            current: Cart,
            account: String,
        ) {
            mutableState.update { it.copy(phase = CheckoutPhase.Loading) }
            val started = generation
            loadJob?.cancel()
            loadJob =
                viewModelScope.launch {
                    val outcome = loader.load(account, current.businessId)
                    if (!isCurrent(started, account)) return@launch
                    when (outcome) {
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
            val account = accountId ?: return
            mutableState.update { it.copy(quoteStatus = QuoteStatus.Loading) }
            val started = generation
            quoteJob =
                viewModelScope.launch {
                    if (debounced) debounce.await()
                    val outcome = fetchQuote(cart, account)
                    if (!isCurrent(started, account)) return@launch
                    mutableState.update { it.withQuote(outcome, lastIntent) }
                }
        }

        private suspend fun fetchQuote(
            bag: Cart?,
            account: String,
        ): QuoteOutcome {
            val current = bag ?: return QuoteOutcome.Failed
            val request = buildQuoteRequest(mutableState.value, current) ?: return QuoteOutcome.Invalid
            return when (val result = checkout.quote(request, account)) {
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
            // La bolsa tambien se captura UNA vez: es la que se cotiza, la que se compara y la que se envia.
            val bag = cart
            val started = generation
            mutableState.update { it.copy(sending = true, message = null) }
            submitJob = viewModelScope.launch { submit(started, account, bag) }
        }

        private suspend fun submit(
            started: Int,
            account: String?,
            bag: Cart?,
        ) {
            if (started == generation) quoteJob?.cancel()
            if (account == null) {
                if (started == generation) stop(CheckoutMessage.Generic)
                return
            }
            val shown = mutableState.value.quote?.total
            val outcome = fetchQuote(bag, account)
            if (!isCurrent(started, account)) return
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
                // La bolsa cambio mientras se recotizaba: el total mostrado no es el de lo que se enviaria.
                cart?.fingerprint() != bag?.fingerprint() -> stop(CheckoutMessage.OptionsChanged)

                shown == null || fresh.total.compareTo(shown) != 0 -> stop(CheckoutMessage.TotalChanged(fresh.total))

                next.pay != before.pay || !ready -> stop(CheckoutMessage.OptionsChanged)

                else -> place(started, account, bag, next, fresh)
            }
        }

        private fun stop(message: CheckoutMessage) = mutableState.update { it.copy(sending = false, message = message) }

        private suspend fun place(
            started: Int,
            account: String,
            current: Cart?,
            form: CheckoutUiState,
            quote: QuoteView,
        ) {
            val request = if (current == null) null else buildOrderRequest(form, current, quote)
            if (current == null || request == null) {
                stop(CheckoutMessage.Generic)
                return
            }
            val result = ledger.place(account, current) { key -> checkout.createOrder(request, key, account) }
            if (!isCurrent(started, account)) {
                // El pedido de la cuenta que salió existe y su bolsa es del dispositivo: se vacía para que nadie la
                // reenvíe, pero esta pantalla (ya de otra cuenta, o de nadie) no navega a él ni muestra nada suyo.
                if (result is PlaceResult.Created || result is PlaceResult.AlreadyCreated) clearBag()
                return
            }
            when (result) {
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
            clearBag()
        }

        // No se cancela a medias: el pedido ya está creado y la bolsa no debe poder reenviarse.
        private suspend fun clearBag() {
            try {
                withContext(NonCancellable) { cartStore.clear() }
            } catch (ignored: IOException) {
                // El pedido ya está creado; si la bolsa no se pudo vaciar, se vacía la próxima vez que se abra.
            }
        }

        /** La persona abrió «Mis pedidos» desde la vista de reconciliación. */
        fun ordersOpened() = mutableState.update { it.copy(reconcileSeen = true) }

        /** «Ya revisé, hacer este pedido»: olvida el intento anterior y vuelve a intentar UNA vez. */
        fun acknowledgeAndRetry() {
            val account = accountId
            // La bolsa tambien se captura UNA vez: es la que se cotiza, la que se compara y la que se envia.
            val bag = cart
            val started = generation
            if (account == null || !mutableState.value.reconcileSeen || mutableState.value.sending) return
            mutableState.update { it.copy(phase = CheckoutPhase.Form, sending = true, message = null) }
            viewModelScope.launch {
                ledger.acknowledgeReconciled(account)
                submit(started, account, bag)
            }
        }
    }
