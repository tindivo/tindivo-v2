package com.tindivo.customer.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Base64

/** Un JWT de prueba, armado a mano y sin firma real: la app lo decodifica SIN verificar. */
internal fun testJwt(payloadJson: String): String {
    val encoder = Base64.getUrlEncoder().withoutPadding()
    val header = encoder.encodeToString("""{"alg":"HS256","typ":"JWT"}""".encodeToByteArray())
    return "$header.${encoder.encodeToString(payloadJson.encodeToByteArray())}.firma-falsa"
}

internal fun testJwtWithEntry(entry: String): String =
    testJwt("""{"sub":"user-1","session_id":"$entry","exp":2000000}""")

/** El decodificador de la `entry` (PS202-001): ante cualquier fallo devuelve `null`, nunca lanza. */
class SessionEntryTest {
    @Test
    fun `un JWT con session_id devuelve ese valor`() {
        assertEquals("sesion-1", sessionEntry(testJwtWithEntry("sesion-1")))
    }

    @Test
    fun `un JWT sin el claim devuelve null`() {
        assertNull(sessionEntry(testJwt("""{"sub":"user-1"}""")))
    }

    @Test
    fun `un claim vacio o que no es texto devuelve null`() {
        assertNull(sessionEntry(testJwt("""{"session_id":""}""")))
        assertNull(sessionEntry(testJwt("""{"session_id":null}""")))
        assertNull(sessionEntry(testJwt("""{"session_id":42}""")))
    }

    @Test
    fun `una base64 rota devuelve null`() {
        assertNull(sessionEntry("cabecera.%%%no-es-base64%%%.firma"))
    }

    @Test
    fun `menos de tres segmentos devuelve null`() {
        assertNull(sessionEntry(""))
        assertNull(sessionEntry("solo-uno"))
        assertNull(sessionEntry("uno.dos"))
    }

    @Test
    fun `un JSON roto o que no es un objeto devuelve null`() {
        assertNull(sessionEntry(testJwt("""{"session_id":""")))
        assertNull(sessionEntry(testJwt("""[1,2,3]""")))
        assertNull(sessionEntry(testJwt("no es json")))
    }
}
