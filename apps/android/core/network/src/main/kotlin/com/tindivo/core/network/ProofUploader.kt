package com.tindivo.core.network

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import okhttp3.Authenticator
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Una URL firmada de subida a `payment-proofs` que ya pasó la validación de [parse]. Es una credencial: quien la tiene
 * puede escribir en esa ruta mientras no venza, así que `toString` no la muestra y nunca va a un log.
 */
class StorageUploadTarget private constructor(
    internal val url: HttpUrl,
) {
    override fun toString(): String = "StorageUploadTarget(***)"

    companion object {
        /** Donde Storage firma las subidas del bucket de comprobantes (`createSignedUploadUrl`). */
        const val UPLOAD_PATH_PREFIX = "/storage/v1/object/upload/sign/payment-proofs/"

        /**
         * [raw] solo vale si es `https`, apunta al mismo host y puerto que [storageOrigin] (el Supabase del entorno,
         * también `https`), sin usuario ni contraseña, con un `token` y exactamente en la ruta de [path] dentro del
         * bucket. Cualquier otra cosa es `null` y no se sube nada.
         */
        fun parse(
            raw: String,
            path: String,
            storageOrigin: HttpUrl,
        ): StorageUploadTarget? {
            val url = raw.toHttpUrlOrNull() ?: return null
            val sameOrigin =
                url.isHttps &&
                    storageOrigin.isHttps &&
                    url.host.equals(storageOrigin.host, ignoreCase = true) &&
                    url.port == storageOrigin.port
            val clean = url.username.isEmpty() && url.password.isEmpty() && url.fragment == null
            val rightPlace = path.isNotBlank() && url.encodedPath == UPLOAD_PATH_PREFIX + path
            val signed = !url.queryParameter("token").isNullOrBlank()
            return if (sameOrigin && clean && rightPlace && signed) StorageUploadTarget(url) else null
        }
    }
}

/** Qué pasó con la subida. Ninguna variante guarda la URL. */
sealed interface UploadOutcome {
    data object Uploaded : UploadOutcome

    /** Storage contestó otra cosa que un 2xx (también una redirección, que no se sigue). */
    data class Rejected(
        val status: Int,
    ) : UploadOutcome

    /** Sin conexión, tiempo agotado o corte a mitad: no se sabe si el archivo llegó. */
    data class Network(
        val cause: IOException,
    ) : UploadOutcome
}

/**
 * Sube los bytes del comprobante con un `PUT` a la URL firmada. Usa su propio cliente ([createStorageUploadClient]),
 * nunca el de la API: así no salen hacia Storage ni el `Authorization: Bearer` de la sesión ni las cabeceras
 * `X-Tindivo-*`, no se reintenta nada por su cuenta y no se sigue una redirección a otro host.
 *
 * @param client el de [createStorageUploadClient]; las pruebas le añaden solo el desvío al servidor falso.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
class ProofUploader(
    private val client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    suspend fun upload(
        target: StorageUploadTarget,
        jpeg: ByteArray,
    ): UploadOutcome {
        val request =
            Request
                .Builder()
                .url(target.url)
                .put(jpeg.toRequestBody(JPEG))
                // Storage no sobrescribe con una URL firmada; se dice igual, por si cambia su valor por defecto.
                .header("x-upsert", "false")
                .build()
        val call = client.newCall(request)
        return coroutineScope {
            val work =
                async(ioDispatcher) {
                    try {
                        call.execute().use { response ->
                            if (response.isSuccessful) UploadOutcome.Uploaded else UploadOutcome.Rejected(response.code)
                        }
                    } catch (e: IOException) {
                        UploadOutcome.Network(e)
                    }
                }
            try {
                work.await()
            } catch (e: CancellationException) {
                // La llamada bloqueante no responde a la cancelación de la corrutina: se corta la `Call` (KT-5).
                call.cancel()
                throw e
            }
        }
    }

    private companion object {
        val JPEG = "image/jpeg".toMediaType()
    }
}

private const val CONNECT_TIMEOUT_SECONDS = 10L
private const val READ_TIMEOUT_SECONDS = 30L
private const val WRITE_TIMEOUT_SECONDS = 60L
private const val CALL_TIMEOUT_SECONDS = 90L

/**
 * El cliente HTTP de las subidas a Storage: SIN interceptores (ni cabeceras de cliente, ni token, ni reintentos), sin
 * redirecciones, sin reintentar conexiones caídas y sin autenticadores. Comparte solo lo que OkHttp trae por defecto:
 * nada de cookies ni caché. La escritura tiene más plazo que la API: una foto sube por datos móviles.
 */
fun createStorageUploadClient(): OkHttpClient =
    OkHttpClient
        .Builder()
        .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .callTimeout(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .retryOnConnectionFailure(false)
        .authenticator(Authenticator.NONE)
        .proxyAuthenticator(Authenticator.NONE)
        .build()
