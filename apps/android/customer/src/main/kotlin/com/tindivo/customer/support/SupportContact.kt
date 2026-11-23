package com.tindivo.customer.support

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
import java.net.URLEncoder
import javax.inject.Inject
import javax.inject.Singleton

/**
 * El número de respaldo del WhatsApp de soporte (CUS-SUP-001), escrito **solo aquí** en toda la app: se usa cuando
 * `GET /public/config` falla o no trae número, para que la ayuda nunca quede sin botón. Manda siempre el del servidor.
 */
internal const val SUPPORT_FALLBACK_WHATSAPP = "51906550166"

/**
 * El WhatsApp de soporte: `supportWhatsapp` de `GET /public/config` (solo dígitos, con el código de país). Es un dato
 * público, sin sesión: se lee una vez y se recuerda mientras viva el proceso. Un fallo no se recuerda (la siguiente
 * pantalla vuelve a intentarlo); un `null` del servidor, sí. En ambos casos la respuesta es [SUPPORT_FALLBACK_WHATSAPP].
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

        /** Los dígitos del número del servidor; si no tiene uno o no se pudo leer, el de respaldo. */
        suspend fun number(): String {
            known?.let { return it.digits ?: SUPPORT_FALLBACK_WHATSAPP }
            return when (val result = catalog.publicConfig()) {
                is ApiResult.Success -> {
                    val digits = result.data.supportWhatsapp?.let(::whatsappDigits)
                    known = Known(digits)
                    digits ?: SUPPORT_FALLBACK_WHATSAPP
                }

                is ApiResult.Failure -> {
                    val error = result.error
                    if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
                    SUPPORT_FALLBACK_WHATSAPP
                }
            }
        }
    }

/** El número de soporte para la pantalla que lo muestra: el de respaldo mientras se lee, así nunca falta el botón. */
@HiltViewModel
internal class SupportViewModel
    @Inject
    constructor(
        source: SupportWhatsapp,
    ) : ViewModel() {
        private val mutableNumber = MutableStateFlow(SUPPORT_FALLBACK_WHATSAPP)
        val number: StateFlow<String> = mutableNumber.asStateFlow()

        init {
            viewModelScope.launch { mutableNumber.value = source.number() }
        }
    }

/** Solo los dígitos de [phone], o `null` si no queda ninguno. */
internal fun whatsappDigits(phone: String): String? = phone.filter { it in '0'..'9' }.takeIf { it.isNotEmpty() }

/**
 * «Ayuda con este pedido» (CUS-SUP-006): «Hola, soy [NOMBRE]. Necesito ayuda con mi pedido #TDV-[CÓDIGO] de
 * [NEGOCIO].», prellenado y revisable (decisión de Jesús, 2026-11-23: todo botón de ayuda que menciona un pedido lleva
 * la firma). Sin nombre: «Hola, necesito ayuda con mi pedido…». Sin nombre de negocio, termina en el código.
 */
internal fun orderHelpLink(
    number: String,
    shortId: String,
    businessName: String?,
    customerName: String? = null,
): String {
    val name = businessName.orEmpty().trim()
    val business = if (name.isEmpty()) "" else " de $name"
    val who = customerName.orEmpty().trim()
    val text =
        if (who.isEmpty()) {
            "Hola, necesito ayuda con mi pedido #TDV-$shortId$business."
        } else {
            "Hola, soy $who. Necesito ayuda con mi pedido #TDV-$shortId$business."
        }
    return whatsappLink(number, text)
}

/**
 * «¿Problema con este pedido?» de un pedido cancelado en el historial (decisión de Jesús, 2026-11-23): «Hola, soy
 * [NOMBRE]. Tengo un problema con mi pedido #TDV-[CÓDIGO].», sin «Motivo:». Sin nombre, «Hola, tengo un problema con mi
 * pedido #TDV-[CÓDIGO].».
 */
internal fun cancelledOrderSupportLink(
    number: String,
    shortId: String,
    customerName: String? = null,
): String {
    val name = customerName.orEmpty().trim()
    val text =
        if (name.isEmpty()) {
            "Hola, tengo un problema con mi pedido #TDV-$shortId."
        } else {
            "Hola, soy $name. Tengo un problema con mi pedido #TDV-$shortId."
        }
    return whatsappLink(number, text)
}

/** «Ayuda por WhatsApp» sin pedido (Cuenta): un saludo para que la persona escriba lo suyo. */
internal fun generalHelpLink(number: String): String = whatsappLink(number, "Hola, necesito ayuda con Tindivo. ")

/** «Si crees que hubo un error» (CUS-SUP-005): la cuenta en pausa o con pago adelantado obligatorio. */
internal fun accountErrorHelpLink(number: String): String =
    whatsappLink(number, "Hola, creo que hubo un error con las restricciones de mi cuenta de Tindivo. ")

/**
 * «Ejercer mis derechos» (CUS-SUP-003): nombra los cuatro derechos ARCO para que la persona deje el suyo y lo revise
 * antes de enviar.
 */
internal fun arcoRightsLink(number: String): String =
    whatsappLink(
        number,
        "Hola, quiero ejercer mi derecho de (acceso / rectificación / cancelación / oposición) " +
            "sobre mis datos personales en Tindivo. Dejo el que corresponde y escribo mi pedido: ",
    )

/** Los Términos y la Privacidad: la web estática de tindivo.com (CUS-SUP-002). */
internal fun termsUrl(webBase: String): String = webBase.trimEnd('/') + "/terminos"

internal fun privacyUrl(webBase: String): String = webBase.trimEnd('/') + "/privacidad"

/** `https://wa.me/<digits>?text=…` con [text] codificado como `encodeURIComponent` de la web. */
internal fun whatsappLink(
    digits: String,
    text: String,
): String {
    // `URLEncoder` deja el espacio como «+»; `encodeURIComponent` lo deja como «%20».
    val encoded = URLEncoder.encode(text, "UTF-8").replace("+", "%20")
    return "https://wa.me/$digits?text=$encoded"
}
