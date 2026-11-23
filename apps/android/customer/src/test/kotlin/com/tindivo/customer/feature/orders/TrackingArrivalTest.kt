package com.tindivo.customer.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Titular de llegada y «No se te cobró nada»: solo se dicen cuando son ciertos. */
class TrackingArrivalTest {
    @Test
    fun `el titular usa el nombre de pila del motorizado`() {
        assertEquals("Luis", driverFirstName("Luis Quispe Huamán"))
        assertEquals("Luis", driverFirstName("  Luis  "))
    }

    @Test
    fun `sin nombre no hay titular con nombre`() {
        assertNull(driverFirstName(null))
        assertNull(driverFirstName("   "))
    }

    @Test
    fun `no se te cobro nada solo si no hubo dinero de por medio`() {
        assertTrue(CancelCopy.BusinessCancelled.nothingCharged(alreadyPaid = false))
        assertTrue(CancelCopy.CustomerCancelled.nothingCharged(alreadyPaid = false))
        assertTrue(CancelCopy.CouldNotConfirm.nothingCharged(alreadyPaid = false))
        assertTrue(CancelCopy.BusinessNoResponse.nothingCharged(alreadyPaid = false))
    }

    @Test
    fun `con comprobante enviado o pago verificado nunca se dice que no se cobro`() {
        CancelCopy.entries.forEach { assertFalse(it.name, it.nothingCharged(alreadyPaid = true)) }
    }

    @Test
    fun `los motivos que no lo prometen no lo resaltan`() {
        listOf(
            CancelCopy.PrepayTimeout,
            CancelCopy.PrepayProofNotReviewed,
            CancelCopy.PrepayProofRejected,
            CancelCopy.AdminCancelled,
            CancelCopy.ProofRejected,
            CancelCopy.PickupNoShow,
            CancelCopy.DeliveryNoShow,
            CancelCopy.Generic,
        ).forEach { assertFalse(it.name, it.nothingCharged(alreadyPaid = false)) }
    }
}
