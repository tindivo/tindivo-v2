package com.tindivo.customer.feature.addresses

/** Un [StreetSuggester] de prueba: contesta lo que se le diga y anota los puntos que le preguntaron. */
internal class FakeStreetSuggester(
    var next: StreetSuggestion = StreetSuggestion.None,
) : StreetSuggester {
    val asked = mutableListOf<GeoPoint>()

    override suspend fun suggest(point: GeoPoint): StreetSuggestion {
        asked += point
        return next
    }
}
