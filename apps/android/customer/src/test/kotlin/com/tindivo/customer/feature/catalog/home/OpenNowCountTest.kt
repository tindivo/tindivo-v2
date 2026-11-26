package com.tindivo.customer.feature.catalog.home

import org.junit.Assert.assertEquals
import org.junit.Test

/** El chip verde «N abiertos ahora» de Restaurantes cuenta solo los restaurantes de la plataforma que están abiertos. */
class OpenNowCountTest {
    private fun card(
        id: String,
        closed: Boolean,
    ) = BusinessCardUi(id, "Negocio $id", null, null, null, closed, 20, 30)

    private fun loaded(
        restaurants: List<BusinessCardUi>,
        whatsapp: List<BusinessCardUi> = emptyList(),
    ) = CatalogHomeUiState.Loaded(restaurants = restaurants, whatsapp = whatsapp)

    @Test
    fun `cuenta los restaurantes abiertos y no los cerrados`() {
        val state = loaded(listOf(card("1", closed = false), card("2", closed = true), card("3", closed = false)))
        assertEquals(2, state.openNowCount)
    }

    @Test
    fun `sin restaurantes o con todos cerrados el conteo es cero`() {
        assertEquals(0, loaded(emptyList()).openNowCount)
        assertEquals(0, loaded(listOf(card("1", closed = true))).openNowCount)
    }

    @Test
    fun `los negocios de solo WhatsApp no entran en el conteo`() {
        val state = loaded(listOf(card("1", closed = false)), whatsapp = listOf(card("2", closed = false)))
        assertEquals(1, state.openNowCount)
    }
}
