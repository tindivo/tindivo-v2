package com.tindivo.customer.feature.orders

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.AccountMismatchException
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseData
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.SessionWatch
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
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
 * Un pedido terminal o un 404 no se vuelven a consultar mientras viva el ViewModel. La sesión se vigila mientras viva el
 * ViewModel, también en segundo plano: al cerrarse se cancela la consulta en curso, se olvida lo leído y la pantalla
 * queda en [OrderDetailUiState.LoggedOut] aunque luego se vuelva a entrar.
 *
 * El seguimiento es de la cuenta que abrió la pantalla. Cada vuelta lee la cuenta vigente antes de consultar: si ya no
 * es esa (otra cuenta o ninguna), hace lo mismo que cuando [SessionWatch] ve el cambio (se olvida lo leído, queda en
 * [OrderDetailUiState.LoggedOut] y no se vuelve a consultar), sin esperar a que él lo vea. La consulta sale atada a esa
 * cuenta: si la sesión cambia entre la lectura y el envío, no sale nada y se trata igual, sin cerrar la sesión nueva.
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

        /** La cuenta con la que se abrió la pantalla, leída al construirla: el sondeo solo consulta con ella. */
        private val openedBy: String? = (sessionStore.state.value as? SessionState.SignedIn)?.userId

        /** El último pedido leído bien: un error de red del sondeo no lo borra; un dato ilegible, sí. */
        private var lastOrder: OrderDetailUi? = null

        /** Lo que detuvo el sondeo para siempre (un pedido terminal o un 404): al volver a la pantalla no se consulta. */
        private var settled: OrderDetailUiState? = null

        /** Una vez cerrada la sesión, esta pantalla no vuelve a consultar aunque se entre otra vez. */
        private val loggedOut = MutableStateFlow(false)

        private val restart = MutableStateFlow(0)

        // Sin `replayExpirationMillis = 0`, el último estado quedaría guardado en segundo plano y volvería a verse al
        // regresar, antes de que el sondeo diga nada. Lo que sí debe volver a verse lo reemite `polling()`.
        val state: StateFlow<OrderDetailUiState> =
            loggedOut
                .flatMapLatest { out ->
                    // Cambiar de flujo cancela el sondeo y la petición en curso: nada de la sesión cerrada se publica.
                    if (out) flowOf(OrderDetailUiState.LoggedOut) else restart.flatMapLatest { polling() }
                }.stateIn(
                    scope = viewModelScope,
                    started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS, replayExpirationMillis = 0),
                    initialValue = OrderDetailUiState.Loading,
                )

        init {
            val watch = SessionWatch()
            viewModelScope.launch { sessionStore.state.collect { if (watch.ended(it)) invalidate() } }
        }

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
                emit(lastOrder?.let(OrderDetailUiState::Loaded) ?: OrderDetailUiState.Loading)
                do {
                    // La cuenta de esta consulta se lee antes de lanzarla: la petición va atada a ella y, ante su 401, se
                    // cierra solo esa. Si ya no es la que abrió la pantalla, no se consulta más.
                    val signedIn = (sessionStore.state.value as? SessionState.SignedIn)?.userId
                    val account = signedIn?.takeIf { it == openedBy }
                    if (account == null) {
                        invalidate()
                        return@flow
                    }
                    val step = reduce(customer.order(id, account), account)
                    emit(step.state)
                    if (step.keepPolling) pollingDelay.await(ORDER_POLL_MILLIS)
                } while (step.keepPolling)
            }

        private suspend fun reduce(
            result: ApiResult<GetCustomerOrder200ResponseData>,
            account: String,
        ): PollStep =
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
                    failure(result.error, account)
                }
            }

        /** [account] es la cuenta que hizo la consulta: ante un 401 se cierra solo esa. */
        private suspend fun failure(
            error: AppError,
            account: String,
        ): PollStep {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            return when {
                error is AppError.Network && error.cause is AccountMismatchException -> {
                    // La sesión ya es de otra cuenta: no salió nada. Se deja de consultar sin cerrar la sesión nueva.
                    invalidate()
                    PollStep(OrderDetailUiState.LoggedOut, keepPolling = false)
                }

                error.isUnauthorized() -> {
                    // Pasó por el refresco y el servidor sigue sin reconocer la sesión: se cierra aquí también.
                    invalidate()
                    // El cierre cancela este mismo sondeo: que no corte a medias el borrado de la sesión. Es `signOutIf`:
                    // espera el candado del almacén y, si mientras tanto entró otra cuenta, no la cierra.
                    withContext(NonCancellable) { sessionStore.signOutIf(account) }
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
         * Con datos ya cargados, un fallo que no dice nada del pedido ([keepsShownOrders]) los conserva y se vuelve a
         * intentar; cualquier otro, o sin datos, pantalla de error. Un pedido terminal nunca llega aquí: se queda en
         * [settled] y no se vuelve a consultar.
         */
        private fun failedStep(error: AppError): PollStep {
            val kept = lastOrder
            return if (kept != null && error.keepsShownOrders()) {
                PollStep(OrderDetailUiState.Loaded(kept), keepPolling = true)
            } else {
                lastOrder = null
                PollStep(OrderDetailUiState.Failed(error), keepPolling = false)
            }
        }

        /** Lo leído es de la sesión que terminó: se olvida y la pantalla queda en [OrderDetailUiState.LoggedOut]. */
        private fun invalidate() {
            lastOrder = null
            settled = null
            loggedOut.value = true
        }
    }

/** Un uuid en su forma canónica; cualquier otra cosa es un pedido que no existe, sin tocar la red. */
internal fun parseOrderId(raw: String?): UUID? =
    raw?.let { text ->
        try {
            UUID.fromString(text).takeIf { it.toString().equals(text, ignoreCase = true) }
        } catch (_: IllegalArgumentException) {
            null
        }
    }
