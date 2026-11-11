package com.tindivo.customer.feature.courier

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.orders.isUnauthorized
import com.tindivo.customer.feature.orders.keepsShownOrders
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
import javax.inject.Inject

/** El estado del servicio en la portada de Entregas. */
internal sealed interface ServiceState {
    data object Loading : ServiceState

    data class Ready(
        val service: CourierServiceUi,
    ) : ServiceState

    data class Failed(
        val error: AppError,
    ) : ServiceState
}

/** «Mis entregas». Sin sesión no hay lista ([Hidden]). */
internal sealed interface CourierListState {
    data object Hidden : CourierListState

    data object Loading : CourierListState

    data object Empty : CourierListState

    data class Loaded(
        val items: List<CourierCardUi>,
        val canLoadMore: Boolean,
        val loadingMore: Boolean = false,
        val loadMoreFailed: Boolean = false,
    ) : CourierListState

    data class Failed(
        val error: AppError,
    ) : CourierListState
}

internal data class CourierHomeUiState(
    val service: ServiceState = ServiceState.Loading,
    val signedIn: Boolean = false,
    val list: CourierListState = CourierListState.Hidden,
) {
    /**
     * La entrega en curso de la cuenta (la más reciente que sigue viva), para el banner «Entrega en curso» y para que la
     * tarjeta lleve a ella: con una viva el servidor rechaza otra.
     */
    val active: CourierCardUi? get() = (list as? CourierListState.Loaded)?.items?.firstOrNull { it.phase.isLive() }
}

/**
 * La portada de Tindivo Entregas: si hoy se puede pedir (sin sesión, como la web: el precio y el horario se ven antes
 * de entrar) y, con sesión, «Mis entregas» de 20 en 20. La lista es de la cuenta: al cambiar de cuenta se olvida y se
 * vuelve a pedir con la nueva; una respuesta de la anterior no se publica.
 */
@HiltViewModel
internal class CourierHomeViewModel
    @Inject
    constructor(
        private val gateway: CourierGateway,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(CourierHomeUiState())
        val state: StateFlow<CourierHomeUiState> = mutableState.asStateFlow()

        private var accountId: String? = null
        private var nextCursor: String? = null

        @Volatile private var generation = 0
        private var statusJob: Job? = null
        private var listJob: Job? = null

        init {
            viewModelScope.launch { sessionStore.state.collect(::onSession) }
            loadStatus()
        }

        private fun onSession(session: SessionState) {
            val userId = (session as? SessionState.SignedIn)?.userId
            if (session == SessionState.Unknown || userId == accountId) return
            accountId = userId
            generation++
            listJob?.cancel()
            nextCursor = null
            mutableState.update {
                it.copy(
                    signedIn = userId != null,
                    list = if (userId == null) CourierListState.Hidden else CourierListState.Loading,
                )
            }
            if (userId != null) loadFirstPage(userId)
        }

        private fun isCurrent(
            started: Int,
            account: String,
        ) = started == generation && (sessionStore.state.value as? SessionState.SignedIn)?.userId == account

        /** Vuelve a leer el estado del servicio y la primera página (al volver a la pantalla o tras un fallo). */
        fun refresh() {
            loadStatus()
            val account = accountId ?: return
            if (listJob?.isActive == true) return
            loadFirstPage(account)
        }

        private fun loadStatus() {
            if (statusJob?.isActive == true) return
            statusJob =
                viewModelScope.launch {
                    when (val result = gateway.status()) {
                        is ApiResult.Success -> {
                            mutableState.update { it.copy(service = ServiceState.Ready(result.data)) }
                        }

                        is ApiResult.Failure -> {
                            val error = result.error
                            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
                            // Lo último que se supo vale más que un error: un corte no borra «Abierto».
                            mutableState.update {
                                if (it.service is ServiceState.Ready) {
                                    it
                                } else {
                                    it.copy(
                                        service = ServiceState.Failed(error),
                                    )
                                }
                            }
                        }
                    }
                }
        }

        private fun loadFirstPage(account: String) {
            val started = generation
            listJob =
                viewModelScope.launch {
                    val result = gateway.page(null, account)
                    if (!isCurrent(started, account)) return@launch
                    when (result) {
                        is ApiResult.Success -> {
                            nextCursor = result.data.nextCursor
                            val list =
                                if (result.data.items.isEmpty() && result.data.nextCursor == null) {
                                    CourierListState.Empty
                                } else {
                                    CourierListState.Loaded(
                                        result.data.items,
                                        canLoadMore =
                                            result.data.nextCursor != null,
                                    )
                                }
                            mutableState.update { it.copy(list = list) }
                        }

                        is ApiResult.Failure -> {
                            onFailure(result.error, started, account) { error ->
                                val shown = mutableState.value.list
                                if (shown is CourierListState.Loaded && error.keepsShownOrders()) {
                                    shown
                                } else {
                                    CourierListState.Failed(error)
                                }
                            }
                        }
                    }
                }
        }

        /** La página siguiente. Sin `nextCursor`, o con una petición de más en curso, no hace nada. */
        fun loadMore() {
            val account = accountId ?: return
            val current = mutableState.value.list as? CourierListState.Loaded ?: return
            if (!current.canLoadMore || current.loadingMore) return
            mutableState.update { it.copy(list = current.copy(loadingMore = true, loadMoreFailed = false)) }
            val cursor = nextCursor
            val started = generation
            listJob =
                viewModelScope.launch {
                    val result = gateway.page(cursor, account)
                    if (!isCurrent(started, account)) return@launch
                    when (result) {
                        is ApiResult.Success -> {
                            nextCursor = result.data.nextCursor
                            val merged = current.items + result.data.items
                            val list = CourierListState.Loaded(merged, canLoadMore = result.data.nextCursor != null)
                            mutableState.update { it.copy(list = list) }
                        }

                        is ApiResult.Failure -> {
                            onFailure(result.error, started, account) { error ->
                                if (error.keepsShownOrders()) {
                                    current.copy(loadingMore = false, loadMoreFailed = true)
                                } else {
                                    CourierListState.Failed(error)
                                }
                            }
                        }
                    }
                }
        }

        /** Avisa de un 426 y cierra la sesión ante un 401; si no, publica lo que diga [shown]. */
        private suspend fun onFailure(
            error: AppError,
            started: Int,
            account: String,
            shown: (AppError) -> CourierListState,
        ) {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (error.isUnauthorized()) {
                // El cierre lo publica el colector de la sesión: la lista se esconde.
                if (isCurrent(started, account)) withContext(NonCancellable) { sessionStore.signOut() }
                return
            }
            mutableState.update { it.copy(list = shown(error)) }
        }
    }
