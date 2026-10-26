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
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.withContext
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
 * Un pedido terminal o un 404 no se vuelven a consultar mientras viva el ViewModel, y al cerrarse la sesión se cancela
 * la consulta en curso: su respuesta ya no llega a la pantalla.
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

        /** El último pedido leído bien: un error de red del sondeo no lo borra; un dato ilegible, sí. */
        private var lastOrder: OrderDetailUi? = null

        /** Lo que detuvo el sondeo para siempre (un pedido terminal o un 404): al volver a la pantalla no se consulta. */
        private var settled: OrderDetailUiState? = null

        /** Una vez cerrada la sesión, esta pantalla no vuelve a consultar aunque se entre con otra cuenta. */
        private var loggedOut = false

        private val restart = MutableStateFlow(0)

        val state: StateFlow<OrderDetailUiState> =
            sessionStore.state
                .map { it is SessionState.SignedOut }
                .distinctUntilChanged()
                .flatMapLatest { signedOut ->
                    // Cambiar de flujo cancela el sondeo y la petición en curso: nada de la sesión cerrada se publica.
                    if (signedOut || loggedOut) {
                        loggedOut = true
                        flowOf(OrderDetailUiState.LoggedOut)
                    } else {
                        restart.flatMapLatest { polling() }
                    }
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
                settled?.let {
                    emit(it)
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
                        val loaded = OrderDetailUiState.Loaded(order)
                        if (order.phase.isTerminal()) settled = loaded
                        PollStep(loaded, keepPolling = !order.phase.isTerminal())
                    } else {
                        // Un dato ilegible no es un fallo de red: lo ya mostrado deja de ser de fiar y se retira.
                        lastOrder = null
                        PollStep(OrderDetailUiState.Failed(unreadableOrderError()), keepPolling = false)
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
                    loggedOut = true
                    lastOrder = null
                    // El cierre cancela este mismo sondeo: que no corte a medias el borrado de la sesión.
                    withContext(NonCancellable) { sessionStore.signOut() }
                    PollStep(OrderDetailUiState.LoggedOut, keepPolling = false)
                }

                error.isNotFound() -> {
                    lastOrder = null
                    settled = OrderDetailUiState.NotFound
                    PollStep(OrderDetailUiState.NotFound, keepPolling = false)
                }

                else -> {
                    failedStep(error)
                }
            }
        }

        /**
         * Con datos ya cargados, un error de red del sondeo los conserva y se vuelve a intentar; sin datos, pantalla de
         * error. Un pedido terminal nunca llega aquí: se queda en [settled] y no se vuelve a consultar.
         */
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
