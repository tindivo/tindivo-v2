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
    fun `install y seq validos se leen y vuelven a las mismas claves, invalidos se ignoran sin tumbar el aviso`() {
        val install = "8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
        val full = valid + mapOf("group" to "order-AB2C3D4E", "install" to install, "seq" to "1794000000000")
        val payload = NativePushPayload.decode(full)

        assertEquals(install, payload?.install)
        assertEquals(1_794_000_000_000L, payload?.seq)
        assertEquals(full, payload?.toData())

        for (bad in listOf("0", "123", "-1794000000000", "01794000000000", "1794000000000.5", "xxx", "1".repeat(17))) {
            assertNull(bad, NativePushPayload.decode(valid + ("seq" to bad))?.seq)
        }
        for (bad in listOf("corto", "x".repeat(65), "")) {
            assertNull(bad, NativePushPayload.decode(valid + ("install" to bad))?.install)
        }
    }

    @Test
    fun `CAX-006 el intent de la notificacion lleva solo la version y la ruta, nunca nombres`() {
        val payload =
            NativePushPayload(
                type = "OrderStatusChanged",
                tag = "OrderStatusChanged-AB2C3D4E",
                title = "Pedro va por tu pedido",
                body = "Lo recoge en Pollería Sabor",
                deepLink = "/pedido/AB2C3D4E",
                group = "order-AB2C3D4E",
                progress = TrackingProgress.of(3, 5),
                install = "8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
                seq = 1_794_000_000_000L,
            )

        val extras = payload.routeExtras()

        assertEquals(mapOf("v" to "1", "deepLink" to "/pedido/AB2C3D4E"), extras)
        assertEquals(PUSH_EXTRA_KEYS.toSet(), extras.keys)
        assertEquals(false, extras.values.any { it.contains("Pedro") || it.contains("Sabor") })
        assertEquals("/pedido/AB2C3D4E", NativePushPayload.decodeRoute(extras))
        // Un aviso pintado por el sistema trae todo `data`: solo se lee la ruta, y tras atenderlo se quita todo.
        assertEquals("/pedido/AB2C3D4E", NativePushPayload.decodeRoute(payload.toData()))
        assertEquals(true, PUSH_EXTRA_KEYS_TO_CLEAR.containsAll(payload.toData().keys))
    }

    @Test
    fun `decodeRoute exige la version 1 y una ruta relativa limpia`() {
        assertNull(NativePushPayload.decodeRoute(emptyMap()))
        assertNull(NativePushPayload.decodeRoute(mapOf("deepLink" to "/pedido/AB2C3D4E")))
        assertNull(NativePushPayload.decodeRoute(mapOf("v" to "2", "deepLink" to "/pedido/AB2C3D4E")))
        for (bad in listOf("//evil.example/x", "https://evil.example/x", "pedido/AB2C3D4E", "/a b", "/a\\b", "")) {
            assertNull(bad, NativePushPayload.decodeRoute(mapOf("v" to "1", "deepLink" to bad)))
        }
    }

    @Test
    fun `CAX-005 dos pedidos con el mismo hashCode de String tienen identidad de notificacion distinta`() {
        val a = "order-AAAAAAAQ"
        val b = "order-AAAAAAB2"
        // La premisa: el requestCode antiguo (group.hashCode()) colisionaba.
        assertEquals(a.hashCode(), b.hashCode())

        assertEquals(false, notificationIdentity(a) == notificationIdentity(b))
        assertEquals(notificationIdentity(a), notificationIdentity(a))
        assertEquals("tindivo-notification://order-update/order-AAAAAAAQ", notificationIdentity(a))
        // Un grupo con caracteres raros no rompe la URI ni se confunde con otro.
        assertEquals(false, notificationIdentity("a/b") == notificationIdentity("a%2Fb"))
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
