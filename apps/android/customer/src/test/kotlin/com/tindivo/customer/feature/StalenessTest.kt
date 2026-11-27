package com.tindivo.customer.feature

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class StalenessTest {
    private val t0 = Instant.parse("2026-11-23T15:00:00Z")

    @Test
    fun `nunca cargado es viejo`() = assertTrue(isStale(null, t0))

    @Test
    fun `justo antes del limite no es viejo y en el limite si`() {
        assertFalse(isStale(t0, t0.plusSeconds(29)))
        assertTrue(isStale(t0, t0.plusSeconds(30)))
    }
}
