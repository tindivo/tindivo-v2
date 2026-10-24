package com.tindivo.customer.config

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.generated.model.GetClientConfig200ResponseData
import com.tindivo.customer.di.AppVersionName
import com.tindivo.customer.di.ApplicationScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/** Un interruptor de `GET /config`: `enabled = false` es el kill switch y [message] es lo que se muestra. */
data class ClientFeature(
    val enabled: Boolean,
    val message: String?,
)

/** Lo que la app sabe de la configuración remota (CLI-4). */
sealed interface ConfigState {
    /** Todavía no hubo una lectura buena (o no hay red): no se bloquea nada. */
    data object Unknown : ConfigState

    /**
     * La versión de la app sirve. [minOsAndroid] se conserva por si hiciera falta; no se bloquea por él (sin decisión
     * de producto sobre qué mostrar).
     */
    data class Ready(
        val features: Map<String, ClientFeature>,
        val minOsAndroid: Int,
    ) : ConfigState

    /** La versión de la app quedó por debajo del mínimo. Dura lo que dura el proceso. */
    data class UpgradeRequired(
        val minVersion: String?,
    ) : ConfigState
}

/**
 * Lee `GET /config` al abrir y al volver a primer plano (CLI-4) y decide si la app debe actualizarse. Una clave de
 * interruptor ausente significa «usa tu valor por defecto compilado», nunca apagada.
 */
@Singleton
class ConfigService
    @Inject
    constructor(
        private val system: SystemRepository,
        @AppVersionName private val appVersion: String,
        @ApplicationScope private val scope: CoroutineScope,
    ) {
        private val _state = MutableStateFlow<ConfigState>(ConfigState.Unknown)
        val state: StateFlow<ConfigState> = _state.asStateFlow()

        private val refreshing = AtomicBoolean(false)

        /** Vuelve a leer `/config`. Si ya hay una lectura en curso, no lanza otra. */
        fun refresh() {
            if (!refreshing.compareAndSet(false, true)) return
            scope.launch {
                try {
                    when (val result = system.config()) {
                        is ApiResult.Success -> apply(result.data.data)
                        is ApiResult.Failure -> applyFailure(result.error)
                    }
                } finally {
                    refreshing.set(false)
                }
            }
        }

        /** Cualquier llamada que reciba un 426 lo avisa aquí; el estado no se deshace. */
        fun reportUpgradeRequired(minVersion: String?) {
            _state.update { current ->
                if (current is ConfigState.UpgradeRequired && (minVersion == null || current.minVersion != null)) {
                    current
                } else {
                    ConfigState.UpgradeRequired(minVersion)
                }
            }
        }

        /** El interruptor [key]; si el servidor no lo declara (o aún no hay lectura), [default]. */
        fun isEnabled(
            key: String,
            default: Boolean,
        ): Boolean = feature(key)?.enabled ?: default

        /** El texto que acompaña al interruptor [key], si el servidor lo trae. */
        fun message(key: String): String? = feature(key)?.message

        private fun feature(key: String): ClientFeature? = (state.value as? ConfigState.Ready)?.features?.get(key)

        private fun apply(config: GetClientConfig200ResponseData) {
            val minRaw = config.minAppVersion.customer.android
            val min = AppVersion.parse(minRaw)
            val own = AppVersion.parse(appVersion)
            if (min != null && own != null && own < min) {
                reportUpgradeRequired(minRaw)
                return
            }
            val features = config.features.mapValues { ClientFeature(it.value.enabled, it.value.message) }
            // UpgradeRequired es pegajoso: una lectura buena posterior no lo deshace.
            val ready = ConfigState.Ready(features, config.minOs.android)
            _state.update { current -> if (current is ConfigState.UpgradeRequired) current else ready }
        }

        // Sin red, 5xx o una respuesta ilegible: se conserva el estado anterior (no se bloquea a nadie).
        private fun applyFailure(error: AppError) {
            if (error is AppError.UpgradeRequired) reportUpgradeRequired(error.minVersion)
        }
    }
