package com.tindivo.customer.feature.orders

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseData
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import java.util.UUID
import javax.inject.Inject

/** La espera entre dos consultas del seguimiento. Se inyecta para probar sin esperar de verdad (KT-4). */
fun interface PollingDelay {
    suspend fun await(millis: Long)
}

/** Cada cuánto se vuelve a consultar un pedido en curso (la web usa 8000 ms). */
internal const val ORDER_POLL_MILLIS = 8_000L

private const val STOP_TIMEOUT_MILLIS = 5_000L

internal sealed interface OrderDetailUiState {
    data object Loading : OrderDetailUiState

    data class Loaded(
        val order: OrderDetailUi,
    ) : OrderDetailUiState

    data class Failed(
        val error: AppError,
    ) : OrderDetailUiState

    /** El pedido no existe o no es de esta persona. */
    data object NotFound : OrderDetailUiState

    /** La sesión se cerró (la persona salió, o el servidor ya no la reconoce): la pantalla vuelve al inicio. */
    data object LoggedOut : OrderDetailUiState
}

/** Un paso del seguimiento: qué enseñar y si hay que volver a consultar. */
private data class PollStep(
    val state: OrderDetailUiState,
    val keepPolling: Boolean,
)

/**
 * El seguimiento de un pedido. Mientras la pantalla está visible y el pedido no es terminal, lo vuelve a consultar
 * cada [ORDER_POLL_MILLIS]; con la pantalla en segundo plano (más de cinco segundos sin quien mire) deja de hacerlo.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
internal class OrderDetailViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val customer: CustomerRepository,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
        private val pollingDelay: PollingDelay,
    ) : ViewModel() {
        // La ruta tipada `OrderDetailRoute(id)` guarda el argumento bajo la clave "id".
        private val orderId: UUID? = parseOrderId(savedStateHandle.get<String>("id"))

        /** El último pedido leído bien: un error del sondeo no lo borra. */
        private var lastOrder: OrderDetailUi? = null

        private val restart = MutableStateFlow(0)

        val state: StateFlow<OrderDetailUiState> =
            combine(restart.flatMapLatest { polling() }, sessionStore.state) { polled, session ->
                if (session is SessionState.SignedOut) OrderDetailUiState.LoggedOut else polled
            }.stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS),
                initialValue = OrderDetailUiState.Loading,
            )

        /** Vuelve a consultar desde cero (después de un error sin datos). */
        fun retry() {
            restart.value++
        }

        private fun polling(): Flow<OrderDetailUiState> =
            flow {
                val id = orderId
                if (id == null) {
                    emit(OrderDetailUiState.NotFound)
                    return@flow
                }
                if (lastOrder == null) emit(OrderDetailUiState.Loading)
                do {
                    val step = reduce(customer.order(id))
                    emit(step.state)
                    if (step.keepPolling) pollingDelay.await(ORDER_POLL_MILLIS)
                } while (step.keepPolling)
            }

        private suspend fun reduce(result: ApiResult<GetCustomerOrder200ResponseData>): PollStep =
            when (result) {
                is ApiResult.Success -> {
                    val order = result.data.toDetailUi()
                    if (order != null) {
                        lastOrder = order
                        PollStep(OrderDetailUiState.Loaded(order), keepPolling = !order.phase.isTerminal())
                    } else {
                        failedStep(unreadableOrderError())
                    }
                }

                is ApiResult.Failure -> {
                    failure(result.error)
                }
            }

        private suspend fun failure(error: AppError): PollStep {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            return when {
                error.isUnauthorized() -> {
                    // Pasó por el refresco y el servidor sigue sin reconocer la sesión: se cierra aquí también.
                    sessionStore.signOut()
                    PollStep(OrderDetailUiState.LoggedOut, keepPolling = false)
                }

                error.isNotFound() -> {
                    PollStep(OrderDetailUiState.NotFound, keepPolling = false)
                }

                else -> {
                    failedStep(error)
                }
            }
        }

        /** Con datos ya cargados, el error del sondeo los conserva y se vuelve a intentar; sin datos, pantalla de error. */
        private fun failedStep(error: AppError): PollStep {
            val kept = lastOrder
            return if (kept != null && error !is AppError.UpgradeRequired) {
                PollStep(OrderDetailUiState.Loaded(kept), keepPolling = true)
            } else {
                PollStep(OrderDetailUiState.Failed(error), keepPolling = false)
            }
        }
    }

/** Un uuid en su forma canónica; cualquier otra cosa es un pedido que no existe, sin tocar la red. */
private fun parseOrderId(raw: String?): UUID? =
    raw?.let { text ->
        try {
            UUID.fromString(text).takeIf { it.toString().equals(text, ignoreCase = true) }
        } catch (_: IllegalArgumentException) {
            null
        }
    }
