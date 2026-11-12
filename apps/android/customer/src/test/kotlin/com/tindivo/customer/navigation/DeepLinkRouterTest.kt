package com.tindivo.customer.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** KT-11: el único traductor de rutas. Las rutas son las que manda `send-push` a la app del cliente. */
class DeepLinkRouterTest {
    @Test
    fun `las rutas que manda send-push al cliente llevan a su pantalla`() {
        assertEquals(DeepLinkTarget.Order("AB2C3D4E"), DeepLinkRouter.route("/pedido/AB2C3D4E"))
        assertEquals(DeepLinkTarget.Account, DeepLinkRouter.route("/cuenta"))
        assertEquals(DeepLinkTarget.Home, DeepLinkRouter.route("/"))
        assertEquals(DeepLinkTarget.Courier("AB2C3D4E"), DeepLinkRouter.route("/entregas/AB2C3D4E"))
    }

    @Test
    fun `una entrega se normaliza igual que un pedido y no se confunde con el`() {
        assertEquals(DeepLinkTarget.Courier("AB2C3D4E"), DeepLinkRouter.route("/entregas/ab2c3d4e"))
        assertEquals(DeepLinkTarget.Courier("AB2C3D4E"), DeepLinkRouter.route("/entregas/AB2C3D4E/?from=push#top"))
        assertEquals(DeepLinkTarget.Order("AB2C3D4E"), DeepLinkRouter.route("/pedido/AB2C3D4E"))
        val home =
            listOf(
                "/entregas",
                "/entregas/",
                "/entregas/AB",
                "/entregas/AB2C-3D4E",
                "/entregas/AB2C3D4E/extra",
                "/entregas/" + "A".repeat(17),
            )
        for (path in home) {
            assertEquals(path, DeepLinkTarget.Home, DeepLinkRouter.route(path))
        }
    }

    @Test
    fun `el codigo se normaliza y la consulta, el fragmento y la barra final no estorban`() {
        assertEquals(DeepLinkTarget.Order("AB2C3D4E"), DeepLinkRouter.route("/pedido/ab2c3d4e"))
        assertEquals(DeepLinkTarget.Order("AB2C3D4E"), DeepLinkRouter.route("/pedido/AB2C3D4E/"))
        assertEquals(DeepLinkTarget.Order("AB2C3D4E"), DeepLinkRouter.route("/pedido/AB2C3D4E?from=push#top"))
        assertEquals(DeepLinkTarget.Account, DeepLinkRouter.route("/cuenta/"))
    }

    @Test
    fun `una ruta que la app no conoce, o un codigo sin forma de codigo, lleva al inicio`() {
        val home =
            listOf(
                "/pedido",
                "/pedido/",
                "/pedido/AB2C3D4E/extra",
                "/pedido/AB",
                "/pedido/" + "A".repeat(17),
                "/pedido/AB2C-3D4E",
                "/pedido/%41B2C3D4E",
                "/cuenta/borrar",
                "/admin",
            )

        for (path in home) {
            assertEquals(path, DeepLinkTarget.Home, DeepLinkRouter.route(path))
        }
    }

    @Test
    fun `un aviso tocado con payload valido lleva a su destino y uno invalido no abre nada`() {
        val payload =
            mapOf(
                "v" to "1",
                "type" to "OrderValidated",
                "tag" to "OrderValidated-AB2C3D4E",
                "title" to "Pedido confirmado",
                "body" to "",
                "deepLink" to "/pedido/AB2C3D4E",
            )

        assertEquals(DeepLinkTarget.Order("AB2C3D4E"), pushTargetFrom(payload))
        assertEquals(DeepLinkTarget.Home, pushTargetFrom(payload + ("deepLink" to "/no-existe")))
        assertNull(pushTargetFrom(payload + ("deepLink" to "//evil.example/pedido/AB2C3D4E")))
        assertNull(pushTargetFrom(payload + ("v" to "2")))
        assertNull(pushTargetFrom(emptyMap()))
    }
}
