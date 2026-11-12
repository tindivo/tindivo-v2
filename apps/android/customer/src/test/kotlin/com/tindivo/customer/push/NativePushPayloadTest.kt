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
        // Sin `group` en el aviso, vale el tag; al volver a las claves, va explícito.
        assertEquals(valid + ("group" to "OrderProofVerified-AB2C3D4E"), payload?.toData())
    }

    @Test
    fun `con step, steps y terminal validos se leen y vuelven a las mismas claves`() {
        val tracking = valid + mapOf("group" to "order-AB2C3D4E", "step" to "2", "steps" to "5")
        val payload = NativePushPayload.decode(tracking)

        assertEquals("order-AB2C3D4E", payload?.group)
        assertEquals(TrackingProgress.of(2, 5), payload?.progress)
        assertEquals(false, payload?.terminal)
        assertEquals(tracking, payload?.toData())

        val delivered = tracking + mapOf("step" to "5", "terminal" to "1")
        assertEquals(true, NativePushPayload.decode(delivered)?.terminal)
        assertEquals(delivered, NativePushPayload.decode(delivered)?.toData())
    }

    @Test
    fun `sin los campos nuevos el aviso se lee como antes, sin barra ni final`() {
        val payload = NativePushPayload.decode(valid)

        assertNull(payload?.progress)
        assertEquals(false, payload?.terminal)
    }

    @Test
    fun `un paso invalido solo quita la barra, el aviso se muestra igual`() {
        val invalid =
            listOf(
                mapOf("step" to "0", "steps" to "5"),
                mapOf("step" to "6", "steps" to "5"),
                mapOf("step" to "dos", "steps" to "5"),
                mapOf("step" to "2", "steps" to "cinco"),
                mapOf("step" to "02", "steps" to "5"),
                mapOf("step" to "-1", "steps" to "5"),
                mapOf("step" to "1.5", "steps" to "5"),
                mapOf("step" to "", "steps" to "5"),
                mapOf("step" to "2", "steps" to "0"),
                mapOf("step" to "999999999999", "steps" to "5"),
                mapOf("step" to "2"),
                mapOf("steps" to "5"),
            )
        for (extra in invalid) {
            val payload = NativePushPayload.decode(valid + extra)
            assertEquals(extra.toString(), "Pago confirmado", payload?.title)
            assertNull(extra.toString(), payload?.progress)
        }
    }

    @Test
    fun `terminal solo vale con el texto exacto 1`() {
        for (value in listOf("0", "true", "", "11", " 1")) {
            assertEquals(value, false, NativePushPayload.decode(valid + ("terminal" to value))?.terminal)
        }
    }

    @Test
    fun `un group vacio o demasiado largo no cumple el contrato y se descarta`() {
        assertNull(NativePushPayload.decode(valid + ("group" to "")))
        assertNull(NativePushPayload.decode(valid + ("group" to "g".repeat(257))))
        assertEquals("g".repeat(256), NativePushPayload.decode(valid + ("group" to "g".repeat(256)))?.group)
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
