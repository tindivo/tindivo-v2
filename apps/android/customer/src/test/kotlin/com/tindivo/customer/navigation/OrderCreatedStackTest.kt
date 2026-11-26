package com.tindivo.customer.navigation

import androidx.navigation.navOptions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Seguimiento: «volver» va al Inicio (`seguimiento.md`); la bolsa y el checkout no quedan debajo del pedido recién creado. */
class OrderCreatedStackTest {
    @Test
    fun `al crear el pedido la pila se recorta hasta el Inicio y lo deja debajo`() {
        val options = navOptions { orderCreatedStack() }
        assertEquals(CatalogHomeRoute::class, options.popUpToRouteClass)
        assertFalse("el Inicio no se saca de la pila", options.isPopUpToInclusive())
        assertTrue(options.shouldLaunchSingleTop())
    }
}
