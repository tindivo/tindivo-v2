package com.tindivo.customer.feature.addresses

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred

/**
 * Un [LocationSource] de prueba. Con [next] contesta al instante; sin él, la lectura espera a [pending] (como un GPS
 * que tarda) y anota si la cancelaron.
 */
internal class FakeLocationSource(
    private val available: Boolean = true,
    var next: LocationReading? = null,
) : LocationSource {
    val pending = CompletableDeferred<LocationReading>()
    var calls = 0
        private set
    var cancelled = false
        private set

    override fun isAvailable(): Boolean = available

    override suspend fun current(): LocationReading {
        calls++
        next?.let { return it }
        try {
            return pending.await()
        } catch (e: CancellationException) {
            cancelled = true
            throw e
        }
    }
}
