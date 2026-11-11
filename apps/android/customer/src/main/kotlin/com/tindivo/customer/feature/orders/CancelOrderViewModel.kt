package com.tindivo.customer.feature.orders

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CustomerRepository
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.SessionWatch
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID
import javax.inject.Inject

/** Pide al servidor cancelar un pedido, solo con el token de [accountId]. Se separa para probar sin red. */
internal fun interface OrderCanceller {
    suspend fun cancel(
        accountId: String,
        orderId: UUID,
    ): ApiResult<Unit>
}

internal class ApiOrderCanceller
    @Inject
    constructor(
        private val customer: CustomerRepository,
    ) : OrderCanceller {
        override suspend fun cancel(
            accountId: String,
            orderId: UUID,
        ): ApiResult<Unit> =
            when (val result = customer.cancelOrder(orderId, accountId)) {
                is ApiResult.Success -> ApiResult.Success(Unit)
                is ApiResult.Failure -> result
            }
    }

/** Por qué no se canceló. */
internal sealed interface CancelProblem {
    /** Sin conexión: no se sabe si llegó; el detalle se vuelve a consultar igual. */
    data object Offline : CancelProblem

    /** El servidor dijo que ya no se puede (409/422/404). [detail] es su motivo en español, si lo trajo. */
    data class NotCancellable(
        val detail: String?,
    ) : CancelProblem

    data object Generic : CancelProblem
}

/**
 * [confirming]: el diálogo «¿Cancelar tu pedido?» está abierto. [cancelling]: la petición está en vuelo. Cada vez que
 * [refreshRequests] sube, el detalle se vuelve a consultar (cancelado, o el servidor dijo que cambió).
 *
 * [settled]: el servidor ya contestó que se canceló o que no se puede cancelar. Un pedido no vuelve a ser cancelable,
 * así que en esta pantalla no se vuelve a ofrecer, aunque el detalle de antes siga a la vista mientras se recarga o si
 * la recarga falla: no sale un segundo `POST` de cancelar.
 */
internal data class CancelUiState(
    val confirming: Boolean = false,
    val cancelling: Boolean = false,
    val problem: CancelProblem? = null,
    val refreshRequests: Int = 0,
    val settled: Boolean = false,
)

/**
 * Cancelar el pedido desde su detalle, como `TrackingCancelRow` de la web: pedir confirmación y, al confirmar, una sola
 * petición aunque se toque dos veces. Si se puede ofrecer lo dice el mapeo ([cancelOfferOf]); si se puede de verdad, el
 * servidor.
 *
 * La sesión se vigila como en el resto de pantallas de la cuenta ([SessionWatch]): si se cierra o cambia de cuenta, se
 * cancela lo que esté en vuelo, se olvida todo y el ViewModel no vuelve a pedir nada. La petición sale atada a la cuenta
 * del principio (`boundTo`) y su respuesta solo se publica si esa cuenta sigue siendo la vigente ([isCurrent]).
 */
@HiltViewModel
internal class CancelOrderViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val canceller: OrderCanceller,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
    ) : ViewModel() {
        private val orderId: UUID? = parseOrderId(savedStateHandle.get<String>("id"))
        private val mutableState = MutableStateFlow(CancelUiState())
        val state: StateFlow<CancelUiState> = mutableState.asStateFlow()

        private var accountId: String? = null
        private var ended = false
        private var generation = 0
        private var job: Job? = null

        init {
            val watch = SessionWatch()
            viewModelScope.launch {
                sessionStore.state.collect { session ->
                    if (watch.ended(session)) {
                        end()
                    } else if (session is SessionState.SignedIn && accountId == null) {
                        accountId = session.userId
                    }
                }
            }
        }

        /** Abre «¿Cancelar tu pedido?». Borra el aviso del intento anterior. */
        fun askToConfirm() {
            val current = mutableState.value
            if (ended || current.cancelling || current.settled) return
            mutableState.update { it.copy(confirming = true, problem = null) }
        }

        /** «No, mantener pedido» o cerrar el diálogo. Con la petición en vuelo no se cierra. */
        fun dismiss() {
            if (mutableState.value.cancelling) return
            mutableState.update { it.copy(confirming = false) }
        }

        /** «Sí, cancelar pedido». Un segundo toque mientras se cancela no hace nada: sale una sola petición. */
        fun confirm() {
            val account = accountId
            val id = orderId
            val current = mutableState.value
            if (ended || !current.confirming || current.cancelling || current.settled) return
            if (account == null || id == null) return
            // `cancelling` se fija antes de lanzar nada: un doble toque ya ve el estado nuevo.
            mutableState.update { it.copy(cancelling = true, problem = null) }
            val started = generation
            job =
                viewModelScope.launch {
                    val result = canceller.cancel(account, id)
                    if (!isCurrent(started, account)) return@launch
                    when (result) {
                        is ApiResult.Success -> finish(problem = null)
                        is ApiResult.Failure -> fail(result.error)
                    }
                }
        }

        private suspend fun fail(error: AppError) {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (error.isUnauthorized()) {
                end()
                // El cierre cancela esta misma corrutina: que no corte a medias el borrado de la sesión.
                withContext(NonCancellable) { sessionStore.signOut() }
                return
            }
            finish(problemOf(error))
        }

        /**
         * Cierra el diálogo y pide volver a consultar el pedido: cancelado, ya no cancelable o sin saber. Si el servidor
         * contestó que se canceló o que ya no se puede, queda [CancelUiState.settled]. Sin conexión o con otro error no:
         * se puede volver a intentar y el servidor decide.
         */
        private fun finish(problem: CancelProblem?) {
            val settled = problem == null || problem is CancelProblem.NotCancellable
            mutableState.update {
                it.copy(
                    confirming = false,
                    cancelling = false,
                    problem = problem,
                    refreshRequests = it.refreshRequests + 1,
                    settled = it.settled || settled,
                )
            }
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
            job?.cancel()
            accountId = null
            mutableState.value = CancelUiState()
        }
    }

private const val STATUS_NOT_FOUND = 404
private const val STATUS_CONFLICT = 409
private const val STATUS_UNPROCESSABLE = 422
private val NOT_CANCELLABLE_STATUSES = setOf(STATUS_NOT_FOUND, STATUS_CONFLICT, STATUS_UNPROCESSABLE)

/** El aviso de un fallo al cancelar. Solo se usa el `detail` del 409 de la RPC, que viene en español para el cliente. */
internal fun problemOf(error: AppError): CancelProblem =
    when {
        error is AppError.Network -> {
            CancelProblem.Offline
        }

        error is AppError.Known && error.status in NOT_CANCELLABLE_STATUSES -> {
            CancelProblem.NotCancellable(error.detail.takeIf { error.code == ApiErrorCode.OrderNotCancellable })
        }

        else -> {
            CancelProblem.Generic
        }
    }
