package com.tindivo.customer.feature.store

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class StoreMappingTest {
    @Test
    fun `un precio de 19_90 se muestra exacto en soles y sin pasar por Double`() {
        val ui = card(price = "19.90").toCardUi()

        assertEquals("S/ 19.90", ui?.priceText.plain())
    }

    @Test
    fun `el precio anterior tachado solo aparece si es mayor y la insignia es el descuento`() {
        val ui = card(price = "19.90", original = "25.00").toCardUi()

        assertEquals("S/ 25.00", ui?.previousPriceText.plain())
        // (25 − 19.90) / 25 = 20.4 % → 20 %.
        assertEquals(StoreBadgeUi.Discount(20), ui?.badge)
        assertNull(card(price = "19.90", original = "19.90").toCardUi()?.previousPriceText)
        assertNull(card(price = "19.90", original = "10").toCardUi()?.previousPriceText)
    }

    @Test
    fun `el descuento redondea como la web y uno que redondea a cero no se muestra`() {
        // 2.5 % → 3 % (Math.round de la web, HALF_UP).
        assertEquals(3, discountPercent(BigDecimal("39.00"), BigDecimal("40.00")))
        assertNull(discountPercent(BigDecimal("99.90"), BigDecimal("100.00")))
        assertNull(discountPercent(BigDecimal("10"), null))
    }

    @Test
    fun `reservado y vendido reemplazan a cualquier otra insignia`() {
        assertEquals(StoreBadgeUi.Reserved, card(status = "reserved", original = "50").toCardUi()?.badge)
        assertEquals(StoreBadgeUi.Sold, card(status = "sold").toCardUi()?.badge)
        assertEquals(StoreBadgeUi.Clearance, card(clearance = true).toCardUi()?.badge)
        assertEquals(StoreBadgeUi.New, card(condition = "new_with_tag", score = null).toCardUi()?.badge)
        assertEquals(StoreBadgeUi.Score(8), card().toCardUi()?.badge)
        assertNull(card(condition = "new_unused").toCardUi()?.badge)
    }

    @Test
    fun `una tarjeta sin titulo, precio, condicion o enlace no se pinta`() {
        assertNull(card(title = " ").toCardUi())
        assertNull(card(price = null).toCardUi())
        assertNull(card(condition = "otra_cosa").toCardUi())
        assertNull(card(slug = null).toCardUi())
        // Un importe con tres decimales no se redondea: la tarjeta se omite.
        assertNull(card(price = "19.999").toCardUi())
    }

    @Test
    fun `el foco de la portada se lee y se acota entre 0 y 1`() {
        val ui = card(focusX = "0.5", focusY = "0.25").toCardUi()
        assertEquals(0.5f, ui?.focusX)
        assertEquals(0.25f, ui?.focusY)
        assertEquals(1f, card(focusX = "1.7").toCardUi()?.focusX)
        assertEquals(0f, card(focusY = "-0.2").toCardUi()?.focusY)
    }

    @Test
    fun `un estado desconocido se trata como disponible`() {
        assertEquals(StoreStatusUi.Available, card(status = "algo_nuevo").toCardUi()?.status)
    }

    @Test
    fun `los ajustes dejan solo los digitos del WhatsApp y vacio es sin numero`() {
        assertEquals("51906550166", settings(number = "+51 906-550-166").toSettingsUi()?.whatsappNumber)
        assertNull(settings(number = "").toSettingsUi()?.whatsappNumber)
        assertEquals("S/ 2.00", settings().toSettingsUi()?.deliveryMinText.plain())
        assertEquals("S/ 2.50", settings().toSettingsUi()?.deliveryMaxText.plain())
        assertNull(settings(min = "-1").toSettingsUi())
    }

    @Test
    fun `la lista omite las tarjetas rotas y conserva el total del servidor`() {
        val ui = listData(products = listOf(card(), card(title = null))).toListUi()

        assertEquals(1, ui?.products?.size)
        assertEquals(5, ui?.totalAvailable)
        assertEquals(listOf(StoreCategoryUi("ropa", "Ropa", 3)), ui?.categories)
    }

    @Test
    fun `el detalle ordena las fotos y arma el enlace de la pieza disponible`() {
        val ui = detailData().toDetailUi(WEB)

        assertEquals(listOf("https://x/1.webp", "https://x/2.webp"), ui?.images?.map { it.url })
        assertTrue(ui?.sized == true)
        assertEquals(StoreAudienceUi.Women, ui?.audience)
        assertEquals(8, ui?.conditionScore)
        val want = ui?.buyAction as StoreBuyAction.Want
        assertTrue(want.whatsappUrl?.startsWith("https://wa.me/51906550166?text=") == true)
        assertTrue(want.whatsappUrl?.contains(encodeUriComponent("$WEB/store/casaca-jean")) == true)
    }

    @Test
    fun `el boton del detalle depende del estado`() {
        val reserved = detailData(status = "reserved").toDetailUi(WEB)?.buyAction
        assertEquals(
            StoreBuyAction.NotifyWhenFree(storeWhatsappUrl(NUMBER, storeReservedMessage("ST-0042"))),
            reserved,
        )
        assertEquals(StoreBuyAction.SeeSimilar("ropa"), detailData(status = "sold").toDetailUi(WEB)?.buyAction)
        assertEquals(
            StoreBuyAction.SeeSimilar(null),
            detailData(status = "sold", category = null).toDetailUi(WEB)?.buyAction,
        )
    }

    @Test
    fun `sin numero de WhatsApp el detalle no ofrece enlace`() {
        assertEquals(StoreBuyAction.Want(null), detailData(number = "").toDetailUi(WEB)?.buyAction)
        assertEquals(
            StoreBuyAction.NotifyWhenFree(null),
            detailData(status = "reserved", number = "").toDetailUi(WEB)?.buyAction,
        )
    }

    @Test
    fun `una pieza nueva no muestra la escala del 1 al 10`() {
        assertNull(detailData(condition = "new_unused").toDetailUi(WEB)?.conditionScore)
    }

    @Test
    fun `el texto del detalle no deja ver el numero ni el enlace`() {
        val text = detailData().toDetailUi(WEB).toString() + StoreBuyAction.Want("https://wa.me/$NUMBER").toString()

        assertTrue(!text.contains(NUMBER))
    }
}
