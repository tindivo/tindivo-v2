package com.tindivo.customer.feature.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.generated.model.ListCustomerOrders200ResponseData
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Clock
import javax.inject.Inject

internal sealed interface OrdersUiState {
    data object Loading : OrdersUiState

    /** La persona aún no ha hecho ningún pedido. */
    data object Empty : OrdersUiState

    /**
     * [canLoadMore] hay otra página (el servidor mandó `nextCursor`); [loadingMore] se está pidiendo;
     * [loadMoreFailed] la última petición de más falló y se puede volver a intentar sin perder lo ya cargado.
     */
    data class Loaded(
        val items: List<OrderCardUi>,
        val canLoadMore: Boolean,
        val loadingMore: Boolean = false,
        val loadMoreFailed: Boolean = false,
    ) : OrdersUiState

    data class Failed(
        val error: AppError,
    ) : OrdersUiState

    /** La sesión se cerró (la persona salió, o el servidor ya no la reconoce): la pantalla vuelve al inicio. */
    data object LoggedOut : OrdersUiState
}

/** El historial de pedidos del cliente, de 20 en 20 con el cursor que manda la API. */
@HiltViewModel
internal class OrdersViewModel
    @Inject
    constructor(
        private val customer: CustomerRepository,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
        private val clock: Clock,
    ) : ViewModel() {
        private val _state = MutableStateFlow<OrdersUiState>(OrdersUiState.Loading)
        val state: StateFlow<OrdersUiState> = _state.asStateFlow()

        private var loadJob: Job? = null
        private var nextCursor: String? = null

        init {
            val watch = SessionWatch()
            viewModelScope.launch {
                sessionStore.state.collect {
                    if (watch.ended(it)) {
                        // La carga en curso es de la sesión cerrada: se cancela y su respuesta no se publica.
                        loadJob?.cancel()
                        _state.value = OrdersUiState.LoggedOut
                    }
                }
            }
            refresh()
        }

        /** Vuelve a pedir la primera página. Si ya hay una carga en curso o la sesión se cerró, no lanza otra. */
        fun refresh() {
            if (loadJob?.isActive == true || _state.value is OrdersUiState.LoggedOut) return
            _state.value = OrdersUiState.Loading
            loadJob = viewModelScope.launch { onFirstPage(customer.orders(null)) }
        }

        /** Pide la página siguiente. Sin `nextCursor`, o con una petición en curso, no hace nada. */
        fun loadMore() {
            val current = _state.value as? OrdersUiState.Loaded ?: return
            if (!current.canLoadMore || loadJob?.isActive == true) return
            _state.value = current.copy(loadingMore = true, loadMoreFailed = false)
            val cursor = nextCursor
            loadJob = viewModelScope.launch { onNextPage(current, customer.orders(cursor)) }
        }

        private suspend fun onFirstPage(result: ApiResult<ListCustomerOrders200ResponseData>) {
            when (result) {
                is ApiResult.Success -> {
                    val page = result.data.toPageUi(clock.instant())
                    if (page == null) {
                        settle(OrdersUiState.Failed(unreadableOrderError()))
                    } else {
                        nextCursor = page.nextCursor
                        settle(
                            if (page.items.isEmpty() && page.nextCursor == null) {
                                OrdersUiState.Empty
                            } else {
                                OrdersUiState.Loaded(page.items, canLoadMore = page.nextCursor != null)
                            },
                        )
                    }
                }

                is ApiResult.Failure -> {
                    onFailure(result.error)?.let { settle(OrdersUiState.Failed(it)) }
                }
            }
        }

        private suspend fun onNextPage(
            before: OrdersUiState.Loaded,
            result: ApiResult<ListCustomerOrders200ResponseData>,
        ) {
            when (result) {
                is ApiResult.Success -> {
                    val page = result.data.toPageUi(clock.instant())
                    if (page == null) {
                        settle(OrdersUiState.Failed(unreadableOrderError()))
                    } else {
                        nextCursor = page.nextCursor
                        settle(OrdersUiState.Loaded(before.items + page.items, canLoadMore = page.nextCursor != null))
                    }
                }

                // Un fallo de red al pedir más no tira lo ya cargado: el botón vuelve y avisa que falló. Una respuesta
                // que no se pudo leer sí lo tira, igual que un importe ilegible.
                is ApiResult.Failure -> {
                    onFailure(result.error)?.let { error ->
                        settle(
                            if (error.keepsShownOrders()) {
                                before.copy(loadingMore = false, loadMoreFailed = true)
                            } else {
                                OrdersUiState.Failed(error)
                            },
                        )
                    }
                }
            }
        }

        /** Avisa de un 426 y cierra la sesión ante un 401; devuelve el error si la pantalla debe mostrarlo. */
        private suspend fun onFailure(error: AppError): AppError? {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (!error.isUnauthorized()) return error
            // Pasó por el refresco y el servidor sigue sin reconocer la sesión: se cierra aquí también. El cierre cancela
            // esta misma carga: que no corte a medias el borrado de la sesión.
            withContext(NonCancellable) { sessionStore.signOut() }
            _state.value = OrdersUiState.LoggedOut
            return null
        }

        /** Una respuesta que llega después de cerrar la sesión no deshace el cierre. */
        private fun settle(next: OrdersUiState) {
            if (_state.value !is OrdersUiState.LoggedOut) _state.value = next
        }
    }
