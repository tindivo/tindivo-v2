package com.tindivo.customer.feature.addresses

/** Lo que el geocodificador del sistema contestó para un punto. */
internal sealed interface StreetSuggestion {
    /** Una calle (con su número si lo hay): se ofrece como sugerida y la persona la corrige. */
    data class Street(
        val line: String,
    ) : StreetSuggestion

    /** Solo llegó la localidad («San Jacinto»): no sirve de calle, se le pide que la escriba (CUS-ADR-018). */
    data class LocalityOnly(
        val locality: String,
    ) : StreetSuggestion

    /** No contestó, falló o no hubo resultado: el campo queda vacío y la persona escribe. */
    data object None : StreetSuggestion
}

/**
 * La calle sugerida desde el mapa, sin coste: el `Geocoder` de Android detrás de una interfaz (CUS-ADR-016). Las pruebas
 * usan un falso. Nunca lanza otra cosa que la cancelación.
 */
internal interface StreetSuggester {
    suspend fun suggest(point: GeoPoint): StreetSuggestion
}

/** Los campos de una dirección del geocodificador que importan para armar la calle. */
internal data class GeocodedAddress(
    val thoroughfare: String? = null,
    val subThoroughfare: String? = null,
    val featureName: String? = null,
    val locality: String? = null,
    val subLocality: String? = null,
)

/**
 * La calle de una respuesta del geocodificador: la vía y su número («Jr. Sucre 412»). Con la vía vacía, o con un nombre
 * que repite la localidad o que es solo un número, no hay calle: queda la localidad ([StreetSuggestion.LocalityOnly]) o
 * nada. Se mira la primera dirección que sí traiga una calle.
 */
internal fun suggestionFrom(addresses: List<GeocodedAddress>): StreetSuggestion {
    for (address in addresses) {
        val street = address.thoroughfare?.trim().orEmpty()
        if (street.isEmpty()) continue
        val number = (address.subThoroughfare ?: address.featureName?.takeIf { it.any(Char::isDigit) }).orEmpty().trim()
        val line =
            when {
                number.isEmpty() || number in street -> street
                street in number -> number
                else -> "$street $number"
            }
        return StreetSuggestion.Street(line.take(ADDRESS_LINE_MAX))
    }
    val locality =
        addresses.firstNotNullOfOrNull {
            (it.locality ?: it.subLocality ?: it.featureName)?.trim()?.takeIf(String::isNotEmpty)
        }
    return if (locality == null) StreetSuggestion.None else StreetSuggestion.LocalityOnly(locality)
}
