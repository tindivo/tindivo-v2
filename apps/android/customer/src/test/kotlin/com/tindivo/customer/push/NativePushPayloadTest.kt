package com.tindivo.customer.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** El payload v1 de `send-push` (`packages/contracts/src/native-push.ts`): lo que no cumple el contrato no se muestra. */
class NativePushPayloadTest {
    // Lo que arma `buildFcmMessage` en `supabase/functions/send-push/native.ts` para el cliente.
    private val valid =
        mapOf(
            "v" to "1",
            "type" to "OrderProofVerified",
            "tag" to "OrderProofVerified-AB2C3D4E",
            "title" to "Pago confirmado",
            "body" to "El restaurante ya prepara tu pedido · #AB2C3D4E",
            "deepLink" to "/pedido/AB2C3D4E",
        )

    @Test
    fun `un payload v1 valido se lee tal cual y vuelve a las mismas claves`() {
        val payload = NativePushPayload.decode(valid)

        assertEquals(
            NativePushPayload(
                type = "OrderProofVerified",
                tag = "OrderProofVerified-AB2C3D4E",
                title = "Pago confirmado",
                body = "El restaurante ya prepara tu pedido · #AB2C3D4E",
                deepLink = "/pedido/AB2C3D4E",
            ),
            payload,
        )
        assertEquals(valid, payload?.toData())
    }

    @Test
    fun `las claves extra de FCM no estorban y el cuerpo puede venir vacio`() {
        val withExtras = valid + mapOf("google.message_id" to "0:123", "body" to "")

        assertEquals("", NativePushPayload.decode(withExtras)?.body)
    }

    @Test
    fun `una version desconocida o ausente se descarta`() {
        assertNull(NativePushPayload.decode(valid + ("v" to "2")))
        assertNull(NativePushPayload.decode(valid + ("v" to "1.0")))
        assertNull(NativePushPayload.decode(valid - "v"))
    }

    @Test
    fun `un deepLink con host, con doble barra o que no es una ruta se descarta`() {
        val rejected =
            listOf(
                "https://evil.example/pedido/AB2C3D4E",
                "//evil.example/pedido/AB2C3D4E",
                "//x",
                "/\\evil.example",
                "pedido/AB2C3D4E",
                "",
                "/pedido/AB2C 3D4E",
                "/pedido/AB2C3D4E\n",
                "/" + "a".repeat(512),
            )

        for (link in rejected) {
            assertNull(link, NativePushPayload.decode(valid + ("deepLink" to link)))
        }
    }

    @Test
    fun `un campo obligatorio ausente, un titulo vacio o un campo demasiado largo se descarta`() {
        for (key in listOf("type", "tag", "title", "body", "deepLink")) {
            assertNull(key, NativePushPayload.decode(valid - key))
        }
        assertNull(NativePushPayload.decode(valid + ("title" to "")))
        assertNull(NativePushPayload.decode(valid + ("title" to "   ")))
        assertNull(NativePushPayload.decode(valid + ("type" to "")))
        assertNull(NativePushPayload.decode(valid + ("tag" to "")))
        assertNull(NativePushPayload.decode(valid + ("type" to "t".repeat(65))))
        assertNull(NativePushPayload.decode(valid + ("tag" to "t".repeat(257))))
        assertNull(NativePushPayload.decode(valid + ("title" to "t".repeat(257))))
        assertNull(NativePushPayload.decode(valid + ("body" to "b".repeat(1025))))
    }

    @Test
    fun `en el limite de cada cota todavia se acepta`() {
        val atLimits =
            valid +
                mapOf(
                    "type" to "t".repeat(64),
                    "tag" to "t".repeat(256),
                    "title" to "t".repeat(256),
                    "body" to "b".repeat(1024),
                    "deepLink" to "/" + "a".repeat(511),
                )

        assertEquals("/" + "a".repeat(511), NativePushPayload.decode(atLimits)?.deepLink)
    }
}
