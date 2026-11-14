package com.tindivo.customer.feature.orders

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.SessionWatch
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Clock
import java.time.Instant
import java.util.UUID
import javax.inject.Inject

/**
 * La sección «Paga tu pedido» del detalle. Pide `prepay-info` cuando la pantalla lo dice ([load]), lleva la cuenta
 * regresiva contra el [clock] inyectado y envía el comprobante con [ProofSender] (URL firmada → PUT → confirmar).
 *
 * La sesión se vigila como en el resto de pantallas de la cuenta ([SessionWatch]): si se cierra o cambia de cuenta, se
 * cancela lo que esté en vuelo, se olvida todo y el ViewModel no vuelve a pedir nada. La sesión del principio es la
 * cuenta Y la generación de entradas con que se adoptó ([SessionStore.signInGeneration]): si alguien entra después,
 * aunque sea la misma cuenta (A → B → A, o cerrar y volver a entrar), también termina (CAX-006). Antes de cada paso y de
 * publicar se comprueba que la sesión vigente sigue siendo esa ([isCurrent]), y cada llamada a la API sale atada a esa
 * cuenta (`boundTo`): nada de una cuenta se confirma ni se muestra en otra.
 *
 * Si al pedir la URL o al confirmar el servidor dice que el pedido ya no espera el pago ([noLongerAwaitsPayment]), la
 * oferta de pago se retira en el acto ([PrepayInfoState.NotAwaiting]: sin destinatario, importe, selector ni envío) y
 * solo vuelve con un `prepay-info` pedido DESPUÉS que diga otra vez `awaiting_payment` (CAX-002).
 */
@HiltViewModel
internal class PrepayViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val gateway: PrepayGateway,
        encoder: ProofImageEncoder,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
        private val clock: Clock,
    ) : ViewModel() {
        private val orderId: UUID? = parseOrderId(savedStateHandle.get<String>("id"))
        private val sender = ProofSender(gateway, encoder)
        private val mutableState = MutableStateFlow(PrepayUiState())
        val state: StateFlow<PrepayUiState> = mutableState.asStateFlow()

        private var accountId: String? = null

        /**
         * La [SessionStore.signInGeneration] con la que se adoptó [accountId], leída antes que la sesión. Si la vigente
         * ya es otra, alguien entró desde entonces (otra cuenta o la misma otra vez) y lo de antes no sigue (CAX-006).
         */
        private var accountSignIns: Long? = null
        private var ended = false
        private var wanted = false
        private var generation = 0

        /** Sube con cada `prepay-info` pedido y al retirar la oferta: una respuesta de antes ya no se aplica. */
        private var infoRequest = 0
        private var paymentMinutes: Int? = null
        private var loadJob: Job? = null
        private var sendJob: Job? = null
        private var countdownJob: Job? = null

        init {
            val watch = SessionWatch()
            viewModelScope.launch {
                sessionStore.state.collect { session ->
                    if (watch.ended(session) || enteredSinceAdopted()) {
                        end()
                    } else if (session is SessionState.SignedIn && accountId == null) {
                        adopt(session.userId)
                    }
                }
            }
            // A → B → A, o cerrar y volver a entrar con A, sin que corra el colector de arriba: `StateFlow` le deja ver
            // solo la A final, igual a la de antes, y no emite. La generación de entradas sí cambió, y eso basta.
            viewModelScope.launch {
                sessionStore.signInGeneration.collect { if (!ended && enteredSinceAdopted()) end() }
            }
        }

        /** El pedido espera el pago: pide (o vuelve a pedir) cómo pagar. Mientras se envía no hace nada. */
        fun load() {
            if (ended || mutableState.value.send is SendState.Sending) return
            wanted = true
            val current = mutableState.value
            if (current.send is SendState.Sent || current.info is PrepayInfoState.NotAwaiting) {
                // Un comprobante enviado que vuelve a esperar pago (lo rechazaron), o una oferta que se retiró: se
                // empieza de cero, sin la foto ni el aviso de antes.
                sender.forget()
                mutableState.update { it.copy(photo = null, send = SendState.Idle) }
            }
            accountId?.let(::startLoad)
        }

        /**
         * La foto elegida en el selector; `null` es que se cerró sin elegir. Mientras se envía o ya enviado no cambia
         * nada: un comprobante enviado no se reemplaza; solo se sube otro si el pedido vuelve a esperar pago ([load]).
         */
        fun onPhotoPicked(photo: String?) {
            val send = mutableState.value.send
            val locked = send is SendState.Sending || send is SendState.Sent
            if (photo == null || ended || locked) return
            sender.forget()
            mutableState.update { it.copy(photo = photo, send = SendState.Idle) }
        }

        /** Envía el comprobante. Un toque mientras envía, o ya enviado, no hace nada ([PrepayUiState.canSend]). */
        fun send() {
            val current = mutableState.value
            val photo = current.photo
            val account = accountId
            val id = orderId
            if (ended || !current.canSend || photo == null || account == null || id == null) return
            val started = generation
            if (!isCurrent(started, account)) return
            // `Sending` se fija antes de lanzar nada: un doble toque ya ve el estado nuevo.
            mutableState.update { it.copy(send = SendState.Sending) }
            sendJob =
                viewModelScope.launch {
                    val step = sender.deliver(account, id, photo) { isCurrent(started, account) }
                    if (isCurrent(started, account)) publish(step, account)
                }
        }

        // Primero la generación y luego la sesión (ver SessionStore.signInGeneration). Si la sesión ya no es la que vio
        // el colector, no se adopta: su siguiente valor terminará el ViewModel.
        private fun adopt(account: String) {
            val signIns = sessionStore.signInGeneration.value
            if ((sessionStore.state.value as? SessionState.SignedIn)?.userId != account) return
            accountSignIns = signIns
            accountId = account
            if (wanted) startLoad(account)
        }

        /** Alguien entró (otra cuenta o la misma otra vez) desde que se adoptó la cuenta. */
        private fun enteredSinceAdopted(): Boolean {
            val adopted = accountSignIns ?: return false
            return sessionStore.signInGeneration.value != adopted
        }

        private fun startLoad(account: String) {
            val id = orderId ?: return
            val started = generation
            if (!isCurrent(started, account)) return
            loadJob?.cancel()
            val request = ++infoRequest
            mutableState.update { it.copy(info = PrepayInfoState.Loading) }
            loadJob =
                viewModelScope.launch {
                    val result = gateway.info(account, id)
                    val minutes = if (result is ApiResult.Success) cachedPaymentMinutes() else null
                    if (!isCurrent(started, account) || request != infoRequest) return@launch
                    when (result) {
                        is ApiResult.Success -> {
                            val info = result.data.toPrepayState(minutes)
                            mutableState.update { it.copy(info = info) }
                            startCountdown((info as? PrepayInfoState.Ready)?.details?.deadline)
                        }

                        is ApiResult.Failure -> {
                            if (handleSessionErrors(result.error, account)) return@launch
                            mutableState.update { it.copy(info = PrepayInfoState.Failed(result.error)) }
                        }
                    }
                }
        }

        private suspend fun cachedPaymentMinutes(): Int? =
            paymentMinutes ?: gateway.paymentMinutes().also { paymentMinutes = it }

        /** Publica los minutos que quedan y se despierta solo cuando cambia el número; al vencer, para. */
        private fun startCountdown(deadline: Instant?) {
            countdownJob?.cancel()
            if (deadline == null) {
                mutableState.update { it.copy(countdown = null) }
                return
            }
            countdownJob =
                viewModelScope.launch {
                    while (true) {
                        val now = clock.instant()
                        val countdown = countdownAt(deadline, now)
                        mutableState.update { it.copy(countdown = countdown) }
                        if (countdown == PrepayCountdown.Expired) break
                        delay(millisUntilNextChange(deadline, now))
                    }
                }
        }

        private suspend fun publish(
            step: SendStep,
            account: String,
        ) {
            when (step) {
                SendStep.Done -> {
                    mutableState.update { it.copy(send = SendState.Sent, refreshRequests = it.refreshRequests + 1) }
                }

                is SendStep.Stopped -> {
                    fail(step.problem, refresh = false, withdraw = false)
                }

                is SendStep.ApiFailed -> {
                    failApi(step.error, account)
                }

                SendStep.Abandoned -> {
                    Unit
                }
            }
        }

        private suspend fun failApi(
            error: AppError,
            account: String,
        ) {
            if (handleSessionErrors(error, account)) return
            val known = (error as? AppError.Known)?.takeIf { it.status in CLIENT_ERRORS }
            val problem =
                when {
                    error is AppError.Network -> SendProblem.Offline
                    known != null -> SendProblem.Rejected(known.fieldMessage ?: known.detail)
                    else -> SendProblem.Generic
                }
            // El servidor dijo que no (ya no espera pago, intentos agotados…): el detalle se vuelve a consultar.
            fail(problem, refresh = known != null, withdraw = error.noLongerAwaitsPayment())
        }

        /**
         * Publica el fallo. Con [withdraw], además retira la oferta de pago en la misma publicación: se olvida la foto y
         * lo preparado, y se descarta cualquier `prepay-info` en vuelo, que es anterior a ese «ya no espera el pago».
         */
        private fun fail(
            problem: SendProblem,
            refresh: Boolean,
            withdraw: Boolean,
        ) {
            if (withdraw) {
                loadJob?.cancel()
                infoRequest++
                countdownJob?.cancel()
                sender.forget()
            }
            mutableState.update {
                val offer =
                    if (withdraw) {
                        it.copy(
                            info = PrepayInfoState.NotAwaiting,
                            countdown = null,
                            photo = null,
                        )
                    } else {
                        it
                    }
                offer.copy(
                    send = SendState.Failed(problem),
                    refreshRequests = if (refresh) it.refreshRequests + 1 else it.refreshRequests,
                )
            }
        }

        /**
         * El 426 y el 401 siguen el flujo de toda la app. `true` si fue un 401: la sesión de [account] (la que hizo la
         * petición) se cierra y no hay más. El cierre es `signOutIf`: espera el candado del almacén, y si mientras tanto
         * entró otra cuenta, esa no se toca.
         */
        private suspend fun handleSessionErrors(
            error: AppError,
            account: String,
        ): Boolean {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (!error.isUnauthorized()) return false
            end()
            // El cierre cancela esta misma corrutina: que no corte a medias el borrado de la sesión.
            withContext(NonCancellable) { sessionStore.signOutIf(account) }
            return true
        }

        /**
         * Sigue siendo la misma sesión: el ViewModel no terminó desde [started], nadie entró desde que se adoptó la
         * cuenta ([SessionStore.signInGeneration], leída antes que la sesión) Y la sesión vigente, leída ahora, es la de
         * [account]. Se lee aquí y no se espera al colector: la continuación de una respuesta puede correr antes que él,
         * y tras A → B → A el colector de la sesión puede no enterarse nunca (CAX-006). Si ya no es la misma, termina
         * en el acto ([end]): estado vacío, sin foto ni ruta, y nada en vuelo.
         */
        private fun isCurrent(
            started: Int,
            account: String,
        ): Boolean {
            if (ended || started != generation) return false
            val signIns = sessionStore.signInGeneration.value
            val session = sessionStore.state.value
            val same = signIns == accountSignIns && (session as? SessionState.SignedIn)?.userId == account
            if (!same) end()
            return same
        }

        private fun end() {
            ended = true
            generation++
            loadJob?.cancel()
            sendJob?.cancel()
            countdownJob?.cancel()
            sender.forget()
            accountId = null
            mutableState.value = PrepayUiState()
        }

        private companion object {
            val CLIENT_ERRORS = 400..499
        }
    }

private const val HTTP_CONFLICT = 409

/**
 * El servidor dice que el pedido ya no espera el comprobante: `invalid_state_transition` (409 en esta API, sea cual sea
 * el estado HTTP con que llegue) o cualquier 409 de estas rutas. Ante la duda se retira la oferta: un `prepay-info` nuevo
 * la devuelve si de verdad sigue esperando el pago.
 */
internal fun AppError.noLongerAwaitsPayment(): Boolean =
    this is AppError.Known && (code == ApiErrorCode.InvalidStateTransition || status == HTTP_CONFLICT)
