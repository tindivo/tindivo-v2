package com.tindivo.customer.feature.courier

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.orders.PollingDelay
import com.tindivo.customer.feature.orders.isNotFound
import com.tindivo.customer.feature.orders.isUnauthorized
import com.tindivo.customer.feature.orders.keepsShownOrders
import com.tindivo.customer.feature.orders.parseOrderId
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.SessionWatch
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Clock
import java.time.Instant
import java.util.UUID
import javax.inject.Inject

/** Cada cuánto se vuelve a consultar una entrega en curso (la web usa 8000 ms). */
internal const val COURIER_POLL_MILLIS = 8_000L

private const val STOP_TIMEOUT_MILLIS = 5_000L
private const val TICK_MILLIS = 1_000L
private const val SECONDS_PER_MINUTE = 60L

internal sealed interface CourierDetailUiState {
    data object Loading : CourierDetailUiState

    data class Loaded(
        val tracking: CourierTrackingUi,
    ) : CourierDetailUiState

    data class Failed(
        val error: AppError,
    ) : CourierDetailUiState

    data object NotFound : CourierDetailUiState

    /** La sesión se cerró, o es de otra cuenta: la pantalla vuelve atrás. */
    data object LoggedOut : CourierDetailUiState
}

/** Cancelar pide un segundo toque (web: un roce anulaba la solicitud). */
internal data class CancelUiState(
    val confirming: Boolean = false,
    val cancelling: Boolean = false,
    val message: CourierMessage? = null,
)

private data class PollStep(
    val state: CourierDetailUiState,
    val keepPolling: Boolean,
)

/**
 * El seguimiento de una entrega de la cuenta. Mientras la pantalla está visible y la entrega no es terminal, la vuelve
 * a consultar cada [COURIER_POLL_MILLIS] (Android no tiene el Realtime de la web: va por sondeo, como el detalle de
 * pedido). Todo sale atado a la cuenta con la que se abrió; si la sesión termina o cambia de cuenta, se cancela la
 * consulta en curso, se olvida lo leído y la pantalla queda en [CourierDetailUiState.LoggedOut].
 *
 * La ruta trae el `id` (para cancelar) y el `shortId` (para el seguimiento). El `shortId` no se valida: es un dato que
 * ya existe en la base (AGENTS.md 1, nunca al rehidratar).
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
internal class CourierDetailViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val gateway: CourierGateway,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
        private val pollingDelay: PollingDelay,
        private val clock: Clock,
    ) : ViewModel() {
        private val courierId: UUID? = parseOrderId(savedStateHandle.get<String>("id"))
        private val shortId: String? = savedStateHandle.get<String>("shortId")?.takeIf { it.isNotBlank() }

        /** La cuenta con la que se abrió la pantalla: la primera con sesión que se vio. Hasta saberla, se espera. */
        private val owner = MutableStateFlow<String?>(null)

        private var lastTracking: CourierTrackingUi? = null
        private var settled: CourierDetailUiState? = null
        private val loggedOut = MutableStateFlow(false)
        private val restart = MutableStateFlow(0)

        private val mutableCancel = MutableStateFlow(CancelUiState())
        val cancel: StateFlow<CancelUiState> = mutableCancel.asStateFlow()

        val state: StateFlow<CourierDetailUiState> =
            loggedOut
                .flatMapLatest { out ->
                    // Cambiar de flujo cancela el sondeo y la petición en curso: nada de la sesión cerrada se publica.
                    if (out) flowOf(CourierDetailUiState.LoggedOut) else owned()
                }.stateIn(
                    scope = viewModelScope,
                    started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS, replayExpirationMillis = 0),
                    initialValue = CourierDetailUiState.Loading,
                )

        /**
         * «Se cancela sola en»: mientras la entrega espera motorizado y el servidor mandó el plazo (`acceptDeadline`, el
         * mismo que ve el motorizado), cuenta segundo a segundo contra él; a cero se detiene (un tick más solo gastaría
         * batería). `null` si no aplica.
         */
        val countdown: StateFlow<AcceptCountdownUi?> =
            state
                .map { shown ->
                    val waiting = (shown as? CourierDetailUiState.Loaded)?.tracking?.takeIf { it.phase.isCancellable() }
                    waiting?.acceptDeadline?.let { it to waiting.acceptMinutes }
                }.distinctUntilChanged()
                .flatMapLatest { plan -> if (plan == null) flowOf(null) else ticking(plan.first, plan.second) }
                .stateIn(
                    scope = viewModelScope,
                    started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS, replayExpirationMillis = 0),
                    initialValue = null,
                )

        init {
            val watch = SessionWatch()
            viewModelScope.launch {
                sessionStore.state.collect { session ->
                    if (watch.ended(session)) {
                        invalidate()
                    } else if (session is SessionState.SignedIn && owner.value == null) {
                        owner.value = session.userId
                    }
                }
            }
        }

        private fun owned(): Flow<CourierDetailUiState> =
            owner.flatMapLatest { account ->
                if (account ==
                    null
                ) {
                    flowOf(CourierDetailUiState.Loading)
                } else {
                    restart.flatMapLatest { polling(account) }
                }
            }

        private fun ticking(
            deadline: Instant,
            minutes: Int,
        ): Flow<AcceptCountdownUi> =
            flow {
                val total = minutes * SECONDS_PER_MINUTE
                while (true) {
                    val left = acceptSecondsLeft(deadline, clock.instant())
                    emit(AcceptCountdownUi(left, total))
                    if (left == 0L) break
                    delay(TICK_MILLIS)
                }
            }

        fun retry() {
            restart.value++
        }

        private fun polling(account: String): Flow<CourierDetailUiState> =
            flow {
                val code = shortId
                if (code == null || courierId == null) {
                    emit(CourierDetailUiState.NotFound)
                    return@flow
                }
                settled?.let {
                    emit(it)
                    return@flow
                }
                emit(lastTracking?.let(CourierDetailUiState::Loaded) ?: CourierDetailUiState.Loading)
                do {
                    val result = gateway.tracking(code, account)
                    // Llegó después de cerrar o cambiar de cuenta: no se muestra ni se aplica a la otra.
                    if (!isOwner(account)) {
                        invalidate()
                        return@flow
                    }
                    val step = reduce(result, account)
                    emit(step.state)
                    if (step.keepPolling) pollingDelay.await(COURIER_POLL_MILLIS)
                } while (step.keepPolling)
            }

        private suspend fun reduce(
            result: ApiResult<CourierTrackingUi>,
            account: String,
        ): PollStep =
            when (result) {
                is ApiResult.Success -> {
                    val tracking = result.data
                    lastTracking = tracking
                    val loaded = CourierDetailUiState.Loaded(tracking)
                    val terminal = tracking.phase.isTerminal()
                    if (terminal) settled = loaded
                    // Si cambió el estado, lo que se estaba confirmando ya no aplica.
                    if (!tracking.phase.isCancellable()) mutableCancel.update { it.copy(confirming = false) }
                    PollStep(loaded, keepPolling = !terminal)
                }

                is ApiResult.Failure -> {
                    failure(result.error, account)
                }
            }

        private suspend fun failure(
            error: AppError,
            account: String,
        ): PollStep {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            return when {
                error.isUnauthorized() -> {
                    signOutIfOwner(account)
                    PollStep(CourierDetailUiState.LoggedOut, keepPolling = false)
                }

                error.isNotFound() -> {
                    lastTracking = null
                    settled = CourierDetailUiState.NotFound
                    PollStep(CourierDetailUiState.NotFound, keepPolling = false)
                }

                else -> {
                    val kept = lastTracking
                    if (kept != null && error.keepsShownOrders()) {
                        PollStep(CourierDetailUiState.Loaded(kept), keepPolling = true)
                    } else {
                        lastTracking = null
                        PollStep(CourierDetailUiState.Failed(error), keepPolling = false)
                    }
                }
            }
        }

        /** «Cancelar solicitud»: pide confirmar. Solo mientras nadie la tomó, como en la web. */
        fun askCancel() {
            val shown = (state.value as? CourierDetailUiState.Loaded)?.tracking ?: return
            if (!shown.phase.isCancellable() || mutableCancel.value.cancelling) return
            mutableCancel.value = CancelUiState(confirming = true)
        }

        fun dismissCancel() {
            if (!mutableCancel.value.cancelling) mutableCancel.value = CancelUiState()
        }

        /** «Sí, cancelar». Un segundo toque mientras se cancela no hace nada. El servidor decide si aún se puede. */
        fun confirmCancel() {
            val current = mutableCancel.value
            val account = owner.value
            val id = courierId
            if (!current.confirming || current.cancelling || account == null || id == null || loggedOut.value) return
            mutableCancel.value = current.copy(cancelling = true, message = null)
            viewModelScope.launch {
                val result = gateway.cancel(id, account)
                if (loggedOut.value || !isOwner(account)) return@launch
                when (result) {
                    is ApiResult.Success -> {
                        mutableCancel.value = CancelUiState()
                    }

                    is ApiResult.Failure -> {
                        onCancelFailed(result.error, account)
                    }
                }
                // Cancelada o no, el estado nuevo lo dice (lo más probable: un motorizado la tomó justo antes).
                if (!loggedOut.value) {
                    settled = null
                    restart.value++
                }
            }
        }

        private suspend fun onCancelFailed(
            error: AppError,
            account: String,
        ) {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (error.isUnauthorized()) {
                signOutIfOwner(account)
                return
            }
            mutableCancel.value = CancelUiState(message = error.toMessage())
        }

        /** La sesión sigue siendo la cuenta con la que se abrió la pantalla. */
        private fun isOwner(account: String): Boolean =
            (sessionStore.state.value as? SessionState.SignedIn)?.userId == account

        /**
         * Un 401 de [account]: la pantalla se cierra y, solo si la sesión sigue siendo esa cuenta, se cierra la sesión. Un
         * 401 atrasado de la cuenta anterior nunca cierra la de otra: el almacén comprueba y cierra de una vez
         * ([SessionStore.signOutIf]), así que tampoco cuando la otra cuenta está entrando en ese momento.
         */
        private suspend fun signOutIfOwner(account: String) {
            val mine = isOwner(account)
            invalidate()
            if (mine) withContext(NonCancellable) { sessionStore.signOutIf(account) }
        }

        private fun invalidate() {
            lastTracking = null
            settled = null
            mutableCancel.value = CancelUiState()
            loggedOut.value = true
        }
    }
