package com.tindivo.customer.feature.orders

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
 * cancela lo que esté en vuelo, se olvida todo y el ViewModel no vuelve a pedir nada. Además, antes de cada paso y de
 * publicar se comprueba que la sesión vigente sigue siendo la del principio ([isCurrent]), y cada llamada a la API sale
 * atada a esa cuenta (`boundTo`): nada de una cuenta se confirma ni se muestra en otra.
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
        private var ended = false
        private var wanted = false
        private var generation = 0
        private var paymentMinutes: Int? = null
        private var loadJob: Job? = null
        private var sendJob: Job? = null
        private var countdownJob: Job? = null

        init {
            val watch = SessionWatch()
            viewModelScope.launch {
                sessionStore.state.collect { session ->
                    if (watch.ended(session)) {
                        end()
                    } else if (session is SessionState.SignedIn && accountId == null) {
                        accountId = session.userId
                        if (wanted) startLoad(session.userId)
                    }
                }
            }
        }

        /** El pedido espera el pago: pide (o vuelve a pedir) cómo pagar. Mientras se envía no hace nada. */
        fun load() {
            if (ended || mutableState.value.send is SendState.Sending) return
            wanted = true
            if (mutableState.value.send is SendState.Sent) {
                // Un comprobante enviado que vuelve a esperar pago (lo rechazaron): se empieza de cero.
                sender.forget()
                mutableState.update { it.copy(photo = null, send = SendState.Idle) }
            }
            accountId?.let(::startLoad)
        }

        /** La foto elegida en el selector; `null` es que se cerró sin elegir. */
        fun onPhotoPicked(photo: String?) {
            if (photo == null || ended || mutableState.value.send is SendState.Sending) return
            sender.forget()
            mutableState.update { it.copy(photo = photo, send = SendState.Idle) }
        }

        /** Envía el comprobante. Un segundo toque mientras envía no hace nada. */
        fun send() {
            val current = mutableState.value
            val photo = current.photo
            val account = accountId
            val id = orderId
            if (ended || !current.canSend || photo == null || account == null || id == null) return
            // `Sending` se fija antes de lanzar nada: un doble toque ya ve el estado nuevo.
            mutableState.update { it.copy(send = SendState.Sending) }
            val started = generation
            sendJob =
                viewModelScope.launch {
                    val step = sender.deliver(account, id, photo) { isCurrent(started, account) }
                    if (isCurrent(started, account)) publish(step)
                }
        }

        private fun startLoad(account: String) {
            val id = orderId ?: return
            loadJob?.cancel()
            val started = generation
            mutableState.update { it.copy(info = PrepayInfoState.Loading) }
            loadJob =
                viewModelScope.launch {
                    val result = gateway.info(account, id)
                    val minutes = if (result is ApiResult.Success) cachedPaymentMinutes() else null
                    if (!isCurrent(started, account)) return@launch
                    when (result) {
                        is ApiResult.Success -> {
                            val info = result.data.toPrepayState(minutes)
                            mutableState.update { it.copy(info = info) }
                            startCountdown((info as? PrepayInfoState.Ready)?.details?.deadline)
                        }

                        is ApiResult.Failure -> {
                            if (handleSessionErrors(result.error)) return@launch
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

        private suspend fun publish(step: SendStep) {
            when (step) {
                SendStep.Done -> {
                    mutableState.update { it.copy(send = SendState.Sent, refreshRequests = it.refreshRequests + 1) }
                }

                is SendStep.Stopped -> {
                    fail(step.problem, refresh = false)
                }

                is SendStep.ApiFailed -> {
                    failApi(step.error)
                }

                SendStep.Abandoned -> {
                    Unit
                }
            }
        }

        private suspend fun failApi(error: AppError) {
            if (handleSessionErrors(error)) return
            val known = (error as? AppError.Known)?.takeIf { it.status in CLIENT_ERRORS }
            val problem =
                when {
                    error is AppError.Network -> SendProblem.Offline
                    known != null -> SendProblem.Rejected(known.fieldMessage ?: known.detail)
                    else -> SendProblem.Generic
                }
            // El servidor dijo que no (ya no espera pago, intentos agotados…): el detalle se vuelve a consultar.
            fail(problem, refresh = known != null)
        }

        private fun fail(
            problem: SendProblem,
            refresh: Boolean,
        ) {
            mutableState.update {
                it.copy(
                    send = SendState.Failed(problem),
                    refreshRequests = if (refresh) it.refreshRequests + 1 else it.refreshRequests,
                )
            }
        }

        /** El 426 y el 401 siguen el flujo de toda la app. `true` si fue un 401: la sesión se cierra y no hay más. */
        private suspend fun handleSessionErrors(error: AppError): Boolean {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (!error.isUnauthorized()) return false
            end()
            // El cierre cancela esta misma corrutina: que no corte a medias el borrado de la sesión.
            withContext(NonCancellable) { sessionStore.signOut() }
            return true
        }

        /**
         * Sigue siendo la misma cuenta: la generación no cambió Y la sesión vigente, leída ahora, es la de [account].
         * La generación sola no basta: la continuación de una respuesta puede correr antes que el colector de la sesión.
         */
        private fun isCurrent(
            started: Int,
            account: String,
        ) = !ended &&
            started == generation &&
            (sessionStore.state.value as? SessionState.SignedIn)?.userId == account

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
