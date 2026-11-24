package com.tindivo.customer.feature.addresses

import kotlinx.coroutines.delay

/** Un [StreetSuggester] de prueba: contesta lo que se le diga y anota los puntos que le preguntaron. */
internal class FakeStreetSuggester(
    var next: StreetSuggestion = StreetSuggestion.None,
    /** Cuánto tarda en contestar (tiempo virtual en las pruebas con `runTest`). */
    var delayMs: Long = 0,
) : StreetSuggester {
    val asked = mutableListOf<GeoPoint>()

    override suspend fun suggest(point: GeoPoint): StreetSuggestion {
        asked += point
        if (delayMs > 0) delay(delayMs)
        return next
    }
}
