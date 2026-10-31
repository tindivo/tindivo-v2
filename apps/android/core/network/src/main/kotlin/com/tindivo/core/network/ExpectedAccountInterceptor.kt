package com.tindivo.core.network

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import java.io.IOException
import java.util.Base64

/**
 * La petición no salió: el token que iba a llevar no es de la cuenta esperada (la sesión cambió de cuenta a mitad, o el
 * token no se pudo leer). Es un [IOException] para que [apiCall] lo devuelva como [AppError.Network]: quien llama lo
 * trata como «no se sabe», nunca como una respuesta del servidor.
 */
class AccountMismatchException : IOException("la petición no lleva el token de la cuenta esperada")

/**
 * Ata una petición a la cuenta [accountId]: deja salir cada intento solo si su `Authorization` es un token cuyo `sub`
 * es esa cuenta. Si no, lanza [AccountMismatchException] sin escribir nada en la red.
 *
 * Va como interceptor de RED (después de [BearerAuthInterceptor] y de [RetryInterceptor]) para mirar cada intento
 * real: también el que [BearerAuthInterceptor] repite con un token nuevo tras un 401, que puede ser de otra cuenta si
 * la sesión cambió mientras tanto. Por qué importa: el servidor responde por la cuenta del token (la consulta de
 * intentos filtra por usuario), así que un `not_found` de otra cuenta no dice nada del intento de [accountId].
 *
 * El `sub` se lee sin comprobar la firma: el token es el que la propia app guardó y aquí solo se compara, no se confía
 * en él para nada más. Un token que no se pueda leer cuenta como «no es de la cuenta».
 */
class ExpectedAccountInterceptor(
    private val accountId: String,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val token = request.header(AUTHORIZATION)?.takeIf { it.startsWith(BEARER) }?.removePrefix(BEARER)
        val subject = token?.let(::jwtSubject)
        if (subject == null || !subject.equals(accountId, ignoreCase = true)) throw AccountMismatchException()
        return chain.proceed(request)
    }
}

/** Un cliente que comparte conexiones con [this] y solo deja salir peticiones con el token de [accountId]. */
fun OkHttpClient.boundTo(accountId: String): OkHttpClient =
    newBuilder().addNetworkInterceptor(ExpectedAccountInterceptor(accountId)).build()

/** El `sub` del cuerpo de un JWT (`cabecera.cuerpo.firma`), o `null` si no tiene esa forma o no trae `sub` de texto. */
internal fun jwtSubject(token: String): String? {
    val parts = token.split('.')
    if (parts.size != JWT_PARTS) return null
    val claims =
        try {
            Json.parseToJsonElement(String(Base64.getUrlDecoder().decode(parts[1]), Charsets.UTF_8))
        } catch (_: IllegalArgumentException) {
            // Base64 inválido; también `SerializationException`, que la hereda: JSON ilegible.
            null
        }
    val sub = (claims as? JsonObject)?.get("sub") as? JsonPrimitive
    return sub?.takeIf { it.isString }?.content?.takeIf { it.isNotBlank() }
}

private const val AUTHORIZATION = "Authorization"
private const val BEARER = "Bearer "
private const val JWT_PARTS = 3
