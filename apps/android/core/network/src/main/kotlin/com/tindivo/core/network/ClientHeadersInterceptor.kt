package com.tindivo.core.network

import okhttp3.Interceptor
import okhttp3.Response
import java.util.UUID

/**
 * Quién llama a la API. Viaja en las cabeceras de cliente de cada petición (CLI-3): la API decide con ellas el 426
 * de versión mínima (CLI-4) y registra el tráfico por versión (CLI-15).
 *
 * @property app la app según el contrato: `customer`, `negocios` o `motorizados`.
 * @property appVersion el `versionName` (semántico, KT-15).
 * @property build el `versionCode`, que pone la CI.
 */
data class ClientInfo(
    val app: String,
    val appVersion: String,
    val build: String,
)

/** Nombres de las cabeceras, como los publica el contrato (`packages/contracts/src/client-compat.ts`). */
object ClientHeaders {
    const val PLATFORM = "X-Tindivo-Platform"
    const val APP = "X-Tindivo-App"
    const val APP_VERSION = "X-Tindivo-App-Version"
    const val BUILD = "X-Tindivo-Build"
    const val REQUEST_ID = "X-Request-Id"

    /** La devuelve la API junto al 426 `client_upgrade_required`. */
    const val MIN_VERSION = "x-tindivo-min-version"

    const val PLATFORM_ANDROID = "android"
}

/**
 * Pone las cabeceras de cliente en toda petición (KT-7: en un interceptor, nunca en cada llamada).
 *
 * Va como interceptor de aplicación **antes** del de reintentos: un reintento repite la misma petición, así que
 * conserva su `X-Request-Id` y en los registros de la API se ve como el mismo intento lógico.
 */
class ClientHeadersInterceptor(
    private val client: ClientInfo,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request =
            chain
                .request()
                .newBuilder()
                .header(ClientHeaders.PLATFORM, ClientHeaders.PLATFORM_ANDROID)
                .header(ClientHeaders.APP, client.app)
                .header(ClientHeaders.APP_VERSION, client.appVersion)
                .header(ClientHeaders.BUILD, client.build)
                .header(ClientHeaders.REQUEST_ID, UUID.randomUUID().toString())
                .build()
        return chain.proceed(request)
    }
}
