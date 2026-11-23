package com.tindivo.customer.navigation

import com.tindivo.customer.feature.catalog.business.BusinessRoute
import com.tindivo.customer.feature.orders.OrdersRoute
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Entre pestañas no se anima (el fundido de 700 ms por defecto superponía dos pantallas). */
class TabSwitchTest {
    private val home = CatalogHomeRoute::class.qualifiedName
    private val orders = OrdersRoute::class.qualifiedName
    private val business = BusinessRoute::class.qualifiedName + "/{id}"

    @Test
    fun `de una pestana a otra es cambio de pestana`() {
        assertTrue(isTabSwitch(home, orders))
    }

    @Test
    fun `la misma pestana o un destino interior no lo son`() {
        assertFalse(isTabSwitch(home, home))
        assertFalse(isTabSwitch(home, business))
        assertFalse(isTabSwitch(business, home))
        assertFalse(isTabSwitch(null, home))
    }
}
