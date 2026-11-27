package com.tindivo.customer.session

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.Base64

private const val JWT_SEGMENTS = 3

/**
 * La entrada de sesión ([SessionState.SignedIn.entry]): el claim `session_id` del access token, leído en local SIN
 * verificar la firma (no es una decisión de seguridad: solo distingue una entrada de otra). Cualquier fallo (formato,
 * base64, JSON, claim ausente, vacío o que no es texto) devuelve `null`. Nunca lanza y nunca escribe el token ni el claim
 * en un log.
 */
internal fun sessionEntry(accessToken: String): String? =
    try {
        val segments = accessToken.split('.')
        if (segments.size < JWT_SEGMENTS) {
            null
        } else {
            val payload = Base64.getUrlDecoder().decode(segments[1]).decodeToString()
            val claim = (Json.parseToJsonElement(payload) as? JsonObject)?.get("session_id") as? JsonPrimitive
            claim?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() }
        }
    } catch (_: Exception) {
        null
    }
