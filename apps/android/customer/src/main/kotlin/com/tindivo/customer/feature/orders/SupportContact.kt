package com.tindivo.customer.feature.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CatalogRepository
import com.tindivo.customer.config.ConfigService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * El WhatsApp de soporte: `supportWhatsapp` de `GET /public/config` (solo dígitos, con el código de país). Es un dato
 * público, sin sesión: se lee una vez y se recuerda mientras viva el proceso. Un fallo no se recuerda (la siguiente
 * pantalla vuelve a intentarlo); un `null` del servidor, sí: no hay número y no se muestra ningún enlace.
 */
@Singleton
internal class SupportWhatsapp
    @Inject
    constructor(
        private val catalog: CatalogRepository,
        private val configService: ConfigService,
    ) {
        /** Lo que ya dijo el servidor; `null` es que todavía no hubo una lectura buena. */
        @Volatile
        private var known: Known? = null

        private class Known(
            val digits: String?,
        )

        /** Los dígitos del número, o `null` si el servidor no tiene uno o no se pudo leer. */
        suspend fun number(): String? {
            known?.let { return it.digits }
            return when (val result = catalog.publicConfig()) {
                is ApiResult.Success -> {
                    val digits = result.data.supportWhatsapp?.let(::whatsappDigits)
                    known = Known(digits)
                    digits
                }

                is ApiResult.Failure -> {
                    val error = result.error
                    if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
                    null
                }
            }
        }
    }

/** El número de soporte para la pantalla que lo muestra; `null` mientras se lee o si no hay. */
@HiltViewModel
internal class SupportViewModel
    @Inject
    constructor(
        source: SupportWhatsapp,
    ) : ViewModel() {
        private val mutableNumber = MutableStateFlow<String?>(null)
        val number: StateFlow<String?> = mutableNumber.asStateFlow()

        init {
            viewModelScope.launch { mutableNumber.value = source.number() }
        }
    }

/** Solo los dígitos de [phone], o `null` si no queda ninguno. */
internal fun whatsappDigits(phone: String): String? = phone.filter { it in '0'..'9' }.takeIf { it.isNotEmpty() }

/**
 * Pedir ayuda con un pedido, desde su detalle: el texto de `support-link.tsx` de la web, con el código tal cual.
 * `null` si no hay número de soporte.
 */
internal fun orderSupportLink(
    number: String?,
    shortId: String,
): String? = number?.let { whatsappLink(it, "Hola, necesito ayuda con mi pedido #$shortId") }

/**
 * «¿Problema con este pedido?» de un pedido cancelado en el historial: el texto de la web (`pedidos/page.tsx`), que
 * deja el motivo para que la persona lo escriba. `null` si no hay número de soporte.
 */
internal fun cancelledOrderSupportLink(
    number: String?,
    shortId: String,
): String? = number?.let { whatsappLink(it, "Hola, tengo un problema con mi pedido #TDV-$shortId. Motivo: ") }
