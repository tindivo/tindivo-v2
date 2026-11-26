package com.tindivo.customer.navigation

import com.tindivo.customer.feature.addresses.AddressesRoute
import com.tindivo.customer.feature.catalog.business.BusinessRoute
import com.tindivo.customer.feature.courier.CourierHomeRoute
import com.tindivo.customer.feature.courier.CourierRequestRoute
import com.tindivo.customer.feature.orders.OrderDetailRoute
import com.tindivo.customer.feature.orders.OrdersRoute
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** La barra inferior solo se ve en las cuatro pestañas raíz (v3.1): nunca dentro del negocio, el checkout ni el seguimiento. */
class RootTabsTest {
    private fun route(type: kotlin.reflect.KClass<*>) = type.qualifiedName

    @Test
    fun `las cuatro raices son pestanas`() {
        assertEquals(RootTab.Home, rootTabFor(route(CatalogHomeRoute::class)))
        assertEquals(RootTab.Courier, rootTabFor(route(CourierHomeRoute::class) + "?listOnly={listOnly}"))
        assertEquals(RootTab.Orders, rootTabFor(route(OrdersRoute::class)))
        assertEquals(RootTab.Account, rootTabFor(route(AccountRoute::class)))
    }

    @Test
    fun `Mis entregas (solo lista) no es una raiz`() {
        assertNull(rootTabFor(route(CourierHomeRoute::class) + "?listOnly={listOnly}", courierListOnly = true))
    }

    @Test
    fun `negocio, bolsa, checkout, seguimiento y formularios no muestran la barra`() {
        listOf(
            BusinessRoute::class,
            CartRoute::class,
            CheckoutRoute::class,
            OrderDetailRoute::class,
            CourierRequestRoute::class,
            AddressesRoute::class,
            SignInRoute::class,
        ).forEach { assertNull(it.qualifiedName, rootTabFor(route(it))) }
    }

    @Test
    fun `sin ruta no hay barra`() {
        assertNull(rootTabFor(null))
    }

    @Test
    fun `sin sesion Pedidos y Cuenta abren la entrada, como Cuenta`() {
        assertTrue(tabNeedsSignIn(RootTab.Orders, signedIn = false))
        assertTrue(tabNeedsSignIn(RootTab.Account, signedIn = false))
        assertFalse(tabNeedsSignIn(RootTab.Home, signedIn = false))
        assertFalse(tabNeedsSignIn(RootTab.Courier, signedIn = false))
    }

    @Test
    fun `con sesion ninguna pestana pide entrar`() {
        RootTab.entries.forEach { assertFalse(tabNeedsSignIn(it, signedIn = true)) }
    }
}
