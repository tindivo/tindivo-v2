package com.tindivo.customer.feature.addresses

import org.junit.Assert.assertEquals
import org.junit.Test

/** Cómo se arma la calle sugerida con lo que contesta el Geocoder de Android. */
internal class StreetSuggestionTest {
    @Test
    fun `la via y su numero forman la calle`() {
        val result = suggestionFrom(listOf(GeocodedAddress(thoroughfare = "Jr. Sucre", subThoroughfare = "412")))

        assertEquals(StreetSuggestion.Street("Jr. Sucre 412"), result)
    }

    @Test
    fun `sin numero queda solo la via`() {
        val result = suggestionFrom(listOf(GeocodedAddress(thoroughfare = "Jr. Sucre", featureName = "Jr. Sucre")))

        assertEquals(StreetSuggestion.Street("Jr. Sucre"), result)
    }

    @Test
    fun `un nombre de lugar con numero que ya trae la via no la repite`() {
        val result = suggestionFrom(listOf(GeocodedAddress(thoroughfare = "Jr. Sucre", featureName = "Jr. Sucre 412")))

        assertEquals(StreetSuggestion.Street("Jr. Sucre 412"), result)
    }

    @Test
    fun `se salta la direccion sin calle y toma la primera que la trae`() {
        val result =
            suggestionFrom(
                listOf(
                    GeocodedAddress(locality = "San Jacinto"),
                    GeocodedAddress(thoroughfare = "Av. Perú", subThoroughfare = "10"),
                ),
            )

        assertEquals(StreetSuggestion.Street("Av. Perú 10"), result)
    }

    @Test
    fun `si solo llega la localidad se pide escribir la calle`() {
        val result = suggestionFrom(listOf(GeocodedAddress(locality = "San Jacinto", featureName = "San Jacinto")))

        assertEquals(StreetSuggestion.LocalityOnly("San Jacinto"), result)
    }

    @Test
    fun `sin resultados no se sugiere nada`() {
        assertEquals(StreetSuggestion.None, suggestionFrom(emptyList()))
        assertEquals(StreetSuggestion.None, suggestionFrom(listOf(GeocodedAddress(thoroughfare = "  "))))
    }
}
