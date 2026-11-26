package com.tindivo.customer.feature.store

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.math.BigDecimal

/**
 * Los mensajes salen IGUALES a los de la web. Los enlaces esperados se generaron con `formatStorePrice`,
 * `buildWhatsappMessage`, `buildReservedMessage`, `buildSearchMessage` y `buildWhatsappUrl` de
 * `packages/contracts/src/store.ts` (con el `encodeURIComponent` de Node), no con este código.
 */
class StoreWhatsappTest {
    @Test
    fun `el pedido de una pieza es el mismo enlace que arma la web`() {
        val text =
            storeProductMessage(
                title = "Casaca jean «Levi's» talla M",
                price = BigDecimal("19.90"),
                code = "ST-0042",
                productUrl = "https://www.tindivo.com/store/casaca-jean-st-0042",
            )

        assertEquals(
            "https://wa.me/51906550166?text=Hola%20Tindivo%2C%20quiero%3A%20Casaca%20jean%20%C2%ABLevi's%C2%BB%20" +
                "talla%20M%20(S%2F19.90)%20%E2%80%94%20c%C3%B3digo%20ST-0042.%20https%3A%2F%2Fwww.tindivo.com%2F" +
                "store%2Fcasaca-jean-st-0042%20%C2%BFSigue%20disponible%3F",
            storeWhatsappUrl("+51 906 550 166", text),
        )
    }

    @Test
    fun `el aviso de una reservada es el de la web`() {
        assertEquals(
            "https://wa.me/51906550166?text=Hola%20Tindivo%2C%20vi%20que%20ST-0042%20est%C3%A1%20reservado." +
                "%20Av%C3%ADsame%20si%20se%20libera.",
            storeWhatsappUrl(NUMBER, storeReservedMessage("ST-0042")),
        )
    }

    @Test
    fun `la busqueda sin resultados recorta el termino y deja sin codificar lo que deja la web`() {
        assertEquals(
            "https://wa.me/51906550166?text=Hola%20Tindivo%2C%20busco%3A%20zapatillas%2038%20%26%20m%C3%A1s*!~." +
                "%20%C2%BFMe%20avisan%20si%20llega%3F",
            storeWhatsappUrl(NUMBER, storeSearchMessage("  zapatillas 38 & más*!~ ")),
        )
    }

    @Test
    fun `el precio del mensaje tiene el formato de la web`() {
        assertEquals("S/30", storeMessagePrice(BigDecimal("30.00")))
        assertEquals("S/29.50", storeMessagePrice(BigDecimal("29.5")))
        assertEquals("S/19.90", storeMessagePrice(BigDecimal("19.90")))
        assertEquals("S/0.10", storeMessagePrice(BigDecimal("0.1")))
        assertEquals("S/100000", storeMessagePrice(BigDecimal("100000")))
    }

    @Test
    fun `sin digitos no hay enlace de WhatsApp`() {
        assertNull(storeWhatsappUrl("", "hola"))
        assertNull(storeWhatsappUrl("sin número", "hola"))
        assertNull(storeWhatsappUrl(null, "hola"))
    }
}
