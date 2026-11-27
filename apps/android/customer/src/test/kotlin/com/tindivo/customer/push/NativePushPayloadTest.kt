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
        assertNull(payload?.install)
    }

    @Test
    fun `install valido se lee, invalido se ignora sin tumbar el aviso (y la puerta lo descarta)`() {
        val install = "8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
        val payload = NativePushPayload.decode(valid + ("install" to install))

        assertEquals(install, payload?.install)
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
                install = "8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
            )

        val extras = payload.routeExtras()

        assertEquals(mapOf("v" to "1", "deepLink" to "/pedido/AB2C3D4E"), extras)
        assertEquals(PUSH_EXTRA_KEYS.toSet(), extras.keys)
        assertEquals(false, extras.values.any { it.contains("Pedro") || it.contains("Sabor") })
        assertEquals("/pedido/AB2C3D4E", NativePushPayload.decodeRoute(extras))
        // Un intent con más claves (las de un aviso de antes, o forjado) solo aporta la ruta, y tras atenderlo se quitan.
        assertEquals("/pedido/AB2C3D4E", NativePushPayload.decodeRoute(valid + ("install" to "x".repeat(10))))
        assertEquals(true, PUSH_EXTRA_KEYS_TO_CLEAR.containsAll(valid.keys + "install"))
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
    fun `CAX-005 dos avisos con el mismo hashCode de String tienen identidad de notificacion distinta`() {
        val a = "OrderStatusChanged-AAAAAAAQ"
        val b = "OrderStatusChanged-AAAAAAB2"
        // La premisa: un requestCode por tag.hashCode() colisionaría.
        assertEquals(a.hashCode(), b.hashCode())

        assertEquals(false, notificationIdentity(a) == notificationIdentity(b))
        assertEquals(notificationIdentity(a), notificationIdentity(a))
        assertEquals("tindivo-notification://order-update/OrderStatusChanged-AAAAAAAQ", notificationIdentity(a))
        // Un tag con caracteres raros no rompe la URI ni se confunde con otro.
        assertEquals(false, notificationIdentity("a/b") == notificationIdentity("a%2Fb"))
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

    // CAX-012: el contrato v1 solo exige 1 a 64 caracteres; la app no es mas estricta que el.
    @Test
    fun `cualquier type que admite el contrato v1 se decodifica, y uno fuera de sus cotas no (CAX-012)`() {
        for (type in listOf(
            "Order_StatusChanged",
            "order.status-changed",
            "tracking:order",
            "Order Status",
            "1Order",
            "a",
        )) {
            assertEquals(type, NativePushPayload.decode(valid + ("type" to type))?.type)
        }
        assertEquals("t".repeat(64), NativePushPayload.decode(valid + ("type" to "t".repeat(64)))?.type)
        assertNull(NativePushPayload.decode(valid + ("type" to "")))
        assertNull(NativePushPayload.decode(valid + ("type" to "t".repeat(65))))
    }
}
