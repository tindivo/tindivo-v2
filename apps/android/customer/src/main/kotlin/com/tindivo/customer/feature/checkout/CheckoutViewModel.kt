package com.tindivo.customer.feature.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CheckoutRepository
import com.tindivo.core.network.generated.model.CreateOrder201ResponseData
import com.tindivo.core.network.generated.model.CreateOrderRequest
import com.tindivo.customer.feature.cart.Cart
import com.tindivo.customer.feature.cart.CartStore
import com.tindivo.customer.feature.cart.ReserveResult
import com.tindivo.customer.feature.cart.fingerprint
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

        /**
         * Cambia con cada cierre o cambio de cuenta. La carga, las cotizaciones y el envío anotan la que vieron al
         * empezar y, antes de publicar cualquier resultado, comprueban que sigue siendo la misma cuenta: si no, lo
         * descartan.
         */
        @Volatile private var generation = 0
        private var quoteJob: Job? = null
        private var loadJob: Job? = null
        private var addressRefresh: Job? = null
        private var phoneRefresh: Job? = null

        /** Con qué cuenta y en qué generación se abrió la hoja: el resultado de una hoja de otra cuenta no se aplica. */
        private var sheetOwner: String? = null
        private var sheetGeneration = -1

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
                    // Entró alguien con la bolsa vacía: ya no hay que pedirle que entre.
                    val empty = cart?.isEmpty() != false
                    if (empty && mutableState.value.phase == CheckoutPhase.SignInRequired) {
                        mutableState.update { it.copy(phase = CheckoutPhase.EmptyBag) }
                    }
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
            cancelRefreshes()
            quoteJob?.cancel()
            quoteJob = null
            loadJob?.cancel()
            loadJob = null
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
                    // Sin bolsa no hay nada que cargar ni cotizar: lo que esté en vuelo sería de una bolsa que ya no existe.
                    loadJob?.cancel()
                    loadJob = null
                    quoteJob?.cancel()
                    quoteJob = null
                    loadedFor = null
                    cancelRefreshes()
                    // Al enviar, la bolsa se vacía dentro del libro ANTES de abrir el pedido: no debe parpadear.
                    // Sin bolsa tampoco queda hoja abierta: lo que traiga ya no tiene a qué aplicarse.
                    if (!mutableState.value.sending) {
                        mutableState.update { it.copy(phase = CheckoutPhase.EmptyBag, sheet = null) }
                    }
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
        fun retryLoad() = reload(prefer = null)

        /** Como [retryLoad]; si la dirección [prefer] llega en la lista, queda elegida. */
        private fun reload(prefer: String?) {
            val current = cart ?: return
            val account = accountId ?: return
            if (current.isEmpty()) return
            load(current, account, prefer)
        }

        /** Abre una hoja encima del checkout. Mientras se envía no se abre ninguna: el formulario no se edita. */
        fun openSheet(sheet: CheckoutSheet) {
            val current = mutableState.value
            val account = accountId
            if (account == null || current.sending || current.phase != sheet.phase) return
            sheetOwner = account
            sheetGeneration = generation
            mutableState.update { it.copy(sheet = sheet) }
        }

        /** Atrás, tocar fuera o «Cerrar»: la hoja se va sin aplicar nada. */
        fun closeSheet() = mutableState.update { it.copy(sheet = null) }

        /** Un toque en «Elige tu dirección»: se cierra la hoja y se cotiza con esa. */
        fun pickAddress(id: String) {
            if (takeSheet { it == CheckoutSheet.ChooseAddress }) selectAddress(id)
        }

        /** La hoja guardó la dirección [id]: se releen las direcciones; si era nueva, queda elegida. */
        fun onAddressSaved(id: String) {
            val added = mutableState.value.sheet == CheckoutSheet.AddAddress
            if (takeSheet { it == CheckoutSheet.AddAddress || it is CheckoutSheet.EditAddress }) {
                refreshAddresses(select = id.takeIf { added })
            }
        }

        /** La hoja de corregir borró la dirección: se releen y, si era la elegida, pasa a la predeterminada. */
        fun onAddressDeleted() {
            if (takeSheet { it is CheckoutSheet.EditAddress }) refreshAddresses(select = null)
        }

        /** La hoja verificó el celular: se relee el perfil para que el botón avance. */
        fun onPhoneVerified() {
            if (takeSheet { it == CheckoutSheet.VerifyPhone }) refreshPhone()
        }

        /** La hoja creó el perfil: se carga el checkout, como al volver de «Completa tu perfil». */
        fun onProfileCompleted() {
            if (takeSheet { it == CheckoutSheet.CompleteProfile }) retryLoad()
        }

        /**
         * Cierra la hoja abierta y dice si su resultado se aplica: tiene que ser la [expected], el checkout seguir en la
         * fase en que se abrió y la sesión seguir siendo la cuenta que la abrió (leída ahora, como en [isCurrent]). Si
         * la sesión cambió, la hoja se cierra igual y no se aplica nada a la cuenta nueva.
         */
        private fun takeSheet(expected: (CheckoutSheet) -> Boolean): Boolean {
            val before = mutableState.value
            val open = before.sheet ?: return false
            val owner = sheetOwner
            mutableState.update { it.copy(sheet = null) }
            val sameAccount = owner != null && isCurrent(sheetGeneration, owner)
            return expected(open) && sameAccount && before.phase == open.phase && !before.sending
        }

        /**
         * Relee solo las direcciones (con el token de la cuenta) y recotiza, sin tocar lo demás del formulario. Si no se
         * pudieron leer, recarga todo y la dirección [select] queda elegida si llega.
         */
        private fun refreshAddresses(select: String?) {
            val account = accountId ?: return
            val started = generation
            addressRefresh?.cancel()
            addressRefresh =
                viewModelScope.launch {
                    val fresh = loader.addresses(account)
                    if (!isCurrent(started, account) || locked()) return@launch
                    if (fresh == null) {
                        reload(prefer = select)
                    } else {
                        mutableState.update { it.withAddresses(fresh, select) }
                        if (!mutableState.value.isPickup) requote(debounced = false)
                    }
                }
        }

        /** Relee el perfil (con el token de la cuenta) para el teléfono; si no se pudo, recarga todo. */
        private fun refreshPhone() {
            val account = accountId ?: return
            val started = generation
            phoneRefresh?.cancel()
            phoneRefresh =
                viewModelScope.launch {
                    val profile = loader.profile(account)
                    if (!isCurrent(started, account) || locked()) return@launch
                    if (profile == null) reload(prefer = null) else mutableState.update { it.withPhoneFrom(profile) }
                }
        }

        private fun cancelRefreshes() {
            addressRefresh?.cancel()
            addressRefresh = null
            phoneRefresh?.cancel()
            phoneRefresh = null
        }

        private fun load(
            current: Cart,
            account: String,
            prefer: String? = null,
        ) {
            mutableState.update { it.copy(phase = CheckoutPhase.Loading, sheet = null) }
            val started = generation
            loadJob?.cancel()
            loadJob =
                viewModelScope.launch {
                    // Una bolsa con la que otra cuenta intentó enviar no se le enseña a esta: nunca un formulario sobre ella.
                    if (!isCurrent(started, account)) return@launch
                    val discarded =
                        try {
                            cartStore.discardForeign(account) { isCurrent(started, account) }
                        } catch (ignored: IOException) {
                            null
                        }
                    if (discarded == true) return@launch // el colector de la bolsa pasa a «bolsa vacía»
                    if (discarded == null) {
                        if (isCurrent(started, account)) {
                            mutableState.update { it.copy(phase = CheckoutPhase.LoadFailed) }
                        }
                        return@launch
                    }
                    if (!isCurrent(started, account)) return@launch
                    val outcome = loader.load(account, current.businessId)
                    if (!isCurrent(started, account)) return@launch
                    when (outcome) {
                        is LoadOutcome.Failed -> {
                            mutableState.update { it.copy(phase = CheckoutPhase.LoadFailed) }
                        }

                        LoadOutcome.ProfileMissing -> {
                            mutableState.update { it.copy(phase = CheckoutPhase.ProfileRequired) }
                        }

                        is LoadOutcome.Loaded -> {
                            lastIntent = outcome.data.lastIntent
                            mutableState.update { it.withLoaded(outcome.data, current).preferring(prefer) }
                            if (mutableState.value.phase == CheckoutPhase.Form) requote(debounced = false)
                        }
                    }
                }
        }

        /** Mientras se envía, lo que se cotizó y se compara es lo que sale: el formulario no se edita. */
        private fun locked() = mutableState.value.sending

        fun setMethod(method: DeliveryChoice) {
            if (locked()) return
            val current = mutableState.value
            val allowed = if (method == DeliveryChoice.Pickup) current.acceptsPickup else current.acceptsDelivery
            if (!allowed || current.method == method) return
            edit { copy(method = method, pay = null, cash = CashChoice.None) }
            requote(debounced = true)
        }

        fun setPickupWhen(choice: PickupWhen) {
            if (locked()) return
            edit { copy(pickupWhen = choice) }
            requote(debounced = true)
        }

        fun selectAddress(id: String) {
            if (locked()) return
            edit { copy(selectedAddressId = id) }
            requote(debounced = true)
        }

        fun setName(text: String) {
            if (!locked()) edit { copy(name = text.take(MAX_NAME_LENGTH)) }
        }

        fun setNote(text: String) {
            if (!locked()) edit { copy(note = text.take(MAX_DRIVER_NOTE_LENGTH)) }
        }

        /** Solo se puede elegir lo que la cotización marca como disponible. */
        fun selectPay(method: PayMethod) {
            if (locked()) return
            val allowed =
                mutableState.value.quote
                    ?.options
                    ?.any { it.method == method && it.available } == true
            if (allowed) edit { copy(pay = method, cash = if (method == PayMethod.Cash) cash else CashChoice.None) }
        }

        fun selectCash(choice: CashChoice) {
            if (!locked()) edit { copy(cash = choice) }
        }

        fun retryQuote() {
            if (!locked()) requote(debounced = false)
        }

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
            viewModelScope.launch {
                submit(started, account, bag)
                emptyBagIfNothingLeft()
            }
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

        /**
         * Al terminar un envío, sea cual sea la rama por la que salió: si el formulario sigue ahí pero la bolsa ya se
         * vació (la consumió el libro, o la vació otro lado mientras `sending` frenaba el aviso), pasa a «bolsa vacía».
         * Una bolsa vacía es del dispositivo, así que vale aunque la generación haya cambiado. No pisa `Opening` ni
         * `Reconcile`.
         */
        private fun emptyBagIfNothingLeft() {
            if (cart?.isEmpty() != false) {
                mutableState.update {
                    if (it.phase == CheckoutPhase.Form && !it.sending) it.copy(phase = CheckoutPhase.EmptyBag) else it
                }
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
            val result = reserveAndSend(started, account, current, request) ?: return
            // El pedido de la cuenta que salió existe y el libro ya consumió su bolsa; esta pantalla (ya de otra
            // cuenta, o de nadie) no navega a él ni muestra nada suyo.
            if (!isCurrent(started, account)) return
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

        /**
         * Reserva la bolsa y envía el pedido. `null` si no se envió nada y el estado ya quedó puesto: la bolsa era de
         * otra cuenta (se descarta), cambió, o no consta qué pasó con el pedido o con la bolsa (el siguiente intento
         * consulta antes de enviar).
         */
        private suspend fun reserveAndSend(
            started: Int,
            account: String,
            current: Cart,
            request: CreateOrderRequest,
        ): PlaceResult<CreateOrder201ResponseData>? =
            try {
                // La bolsa se consume DENTRO del libro, antes de olvidar el intento; el envío no se cancela.
                if (reserve(started, account, current) && isCurrent(started, account)) {
                    val consume: suspend (String) -> Unit = { fingerprint -> cartStore.consume(account, fingerprint) }
                    ledger.place(account, current, consume) { key -> checkout.createOrder(request, key, account) }
                } else {
                    null
                }
            } catch (ignored: IOException) {
                if (isCurrent(started, account)) stop(CheckoutMessage.StillProcessing)
                null
            }

        /** La bolsa con la que otra cuenta intentó enviar no se envía ni se enseña: se descarta. */
        private suspend fun reserve(
            started: Int,
            account: String,
            current: Cart,
        ): Boolean =
            when (cartStore.reserve(account, current.fingerprint()) { isCurrent(started, account) }) {
                ReserveResult.Foreign -> {
                    // La escritura de `reserve` ya vació la bolsa. La fase la resuelven el colector de la bolsa y
                    // `emptyBagIfNothingLeft`, en cualquiera de los dos órdenes.
                    if (isCurrent(started, account)) mutableState.update { it.copy(sending = false) }
                    false
                }

                ReserveResult.Changed -> {
                    if (isCurrent(started, account)) stop(CheckoutMessage.OptionsChanged)
                    false
                }

                ReserveResult.Reserved -> {
                    true
                }
            }

        private fun failed(result: PlaceResult.Failed) {
            mutableState.update { it.withRejection(result.error) }
            val rejected = result.error.clientDetail() != null
            if (rejected && mutableState.value.phase == CheckoutPhase.Form) requote(debounced = false)
        }

        // El pedido existe y el libro ya vació la bolsa (con `sending` aún activo, así que no parpadeó «bolsa vacía»).
        private fun opened(orderId: String) {
            mutableState.update { it.copy(phase = CheckoutPhase.Opening, createdOrderId = orderId, sending = false) }
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
                emptyBagIfNothingLeft()
            }
        }
    }
