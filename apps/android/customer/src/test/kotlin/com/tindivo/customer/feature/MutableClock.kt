package com.tindivo.customer.feature

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

/** Reloj de prueba que solo avanza cuando la prueba lo mueve. */
internal class MutableClock(
    private var now: Instant = Instant.parse("2026-11-23T15:00:00Z"),
) : Clock() {
    fun advance(by: Duration) {
        now = now.plus(by)
    }

    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId?): Clock = this

    override fun instant(): Instant = now
}
