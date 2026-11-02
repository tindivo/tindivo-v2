package com.tindivo.customer.feature.addresses

import com.tindivo.core.network.generated.model.GetPublicConfig200ResponseData
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Un punto del mapa en grados. Solo sirve para dibujar y comparar: lo que viaja al servidor se redondea aparte. */
data class GeoPoint(
    val lat: Double,
    val lng: Double,
)

/**
 * ¿El punto cae dentro del polígono? Ray casting (regla par-impar): un rayo horizontal desde el punto cuenta los lados
 * que cruza; impar = dentro. `lng` es x y `lat` es y; a la escala de un pueblo la distorsión no importa. Con menos de
 * tres vértices no hay área: queda fuera. Un punto exactamente sobre un borde se decide por la regla (puede caer a
 * cualquiera de los dos lados): el borde no es una frontera exacta.
 */
fun isInsideCoverage(
    lat: Double,
    lng: Double,
    polygon: List<GeoPoint>,
): Boolean {
    if (polygon.size < MIN_VERTICES) return false
    var inside = false
    var j = polygon.size - 1
    for (i in polygon.indices) {
        val pi = polygon[i]
        val pj = polygon[j]
        val crosses = (pi.lat > lat) != (pj.lat > lat)
        if (crosses && lng < (pj.lng - pi.lng) * (lat - pi.lat) / (pj.lat - pi.lat) + pi.lng) inside = !inside
        j = i
    }
    return inside
}

/** La zona de reparto: el polígono si el servidor lo manda; si no, el centro con su radio. */
sealed interface CoverageArea {
    val center: GeoPoint

    fun contains(point: GeoPoint): Boolean

    data class Polygon(
        val vertices: List<GeoPoint>,
    ) : CoverageArea {
        override val center: GeoPoint =
            GeoPoint(vertices.map { it.lat }.average(), vertices.map { it.lng }.average())

        override fun contains(point: GeoPoint): Boolean = isInsideCoverage(point.lat, point.lng, vertices)
    }

    data class Circle(
        override val center: GeoPoint,
        val radiusKm: Double,
    ) : CoverageArea {
        override fun contains(point: GeoPoint): Boolean = haversineKm(center, point) <= radiusKm
    }

    companion object {
        /** El centro de San Jacinto con 3 km: lo que usa la web cuando la configuración no llega. */
        val Fallback: CoverageArea = Circle(GeoPoint(FALLBACK_LAT, FALLBACK_LNG), FALLBACK_RADIUS_KM)

        /** Polígono con al menos tres vértices; si no, círculo; si tampoco, [Fallback]. */
        fun from(config: GetPublicConfig200ResponseData?): CoverageArea {
            val ring = config?.coveragePolygon?.map { GeoPoint(it.lat.toDouble(), it.lng.toDouble()) }
            if (ring != null && ring.size >= MIN_VERTICES) return Polygon(ring)
            val circle = config?.coverage ?: return Fallback
            return Circle(
                GeoPoint(circle.centerLat.toDouble(), circle.centerLng.toDouble()),
                circle.radiusKm.toDouble(),
            )
        }
    }
}

private const val MIN_VERTICES = 3
private const val FALLBACK_LAT = -9.1547
private const val FALLBACK_LNG = -78.5042
private const val FALLBACK_RADIUS_KM = 3.0
private const val EARTH_RADIUS_KM = 6371.0

private fun haversineKm(
    a: GeoPoint,
    b: GeoPoint,
): Double {
    val dLat = Math.toRadians(b.lat - a.lat)
    val dLng = Math.toRadians(b.lng - a.lng)
    val h = sin(dLat / 2).pow(2) + cos(Math.toRadians(a.lat)) * cos(Math.toRadians(b.lat)) * sin(dLng / 2).pow(2)
    return 2 * EARTH_RADIUS_KM * asin(sqrt(h))
}
