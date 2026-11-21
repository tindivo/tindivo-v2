package com.tindivo.customer.feature.catalog.home

import org.junit.Assert.assertEquals
import org.junit.Test

class ServiceCardsTest {
    @Test
    fun `CA-CAT-05 el Inicio no muestra la tarjeta de Store mientras Store esta fuera del lanzamiento`() {
        assertEquals(listOf(ServiceCard.Courier), serviceCards())
    }

    @Test
    fun `CA-CAT-05 con Store en el lanzamiento la tarjeta vuelve despues de Entregas`() {
        assertEquals(listOf(ServiceCard.Courier, ServiceCard.Store), serviceCards(storeInLaunch = true))
    }
}
