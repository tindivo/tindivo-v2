package com.tindivo.customer.feature.checkout

import com.tindivo.customer.bag.DeliveryMethod
import org.junit.Assert.assertEquals
import org.junit.Test

/** CUS-CRT-007: el checkout abre con el método que recuerda la bolsa, si el negocio lo admite. */
class StartingMethodTest {
    @Test
    fun `CA-CRT-04 · una bolsa de recojo abre el checkout en recojo si el negocio lo admite`() {
        assertEquals(DeliveryChoice.Pickup, startingMethod(DeliveryMethod.Pickup, true, true))
    }

    @Test
    fun `una bolsa nueva abre en delivery`() {
        assertEquals(DeliveryChoice.Delivery, startingMethod(DeliveryMethod.Delivery, true, true))
    }

    @Test
    fun `si el negocio ya no admite recojo, abre en delivery aunque la bolsa lo recuerde`() {
        assertEquals(DeliveryChoice.Delivery, startingMethod(DeliveryMethod.Pickup, true, false))
    }

    @Test
    fun `si el negocio solo admite recojo, abre en recojo`() {
        assertEquals(DeliveryChoice.Pickup, startingMethod(DeliveryMethod.Delivery, false, true))
    }
}
