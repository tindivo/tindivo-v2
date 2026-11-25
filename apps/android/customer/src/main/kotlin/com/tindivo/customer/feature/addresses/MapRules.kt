package com.tindivo.customer.feature.addresses

import kotlin.math.max

/** Un gesto que mueve el centro menos que esto no fija punto: es un roce, no una elección (3 m). */
internal const val MIN_MOVE_M = 3.0

/** El zoom al fijar un punto o al llegar el GPS: se ve la manzana y la puerta. */
internal const val FIX_ZOOM = 18f

/** El zoom del mapa al abrir sin punto: se ve el pueblo. */
internal const val AREA_ZOOM = 15f

/** Cuánto se puede alejar y acercar la persona: ni el país entero ni una pared. */
internal const val MIN_ZOOM = 14f
internal const val MAX_ZOOM = 20f

/** El zoom del mini-mapa del paso de los datos. */
internal const val SUMMARY_ZOOM = 17f

/** La precisión que se exige al GPS si la configuración no llega (`location_validation.maxAccuracyM`, decisión D-C). */
internal const val DEFAULT_MAX_ACCURACY_M = 30f

private const val BOUNDS_MARGIN = 0.25
private const val METERS_PER_KM = 1000.0

/** ¿El gesto movió el centro lo bastante como para contar como elección? Sin centro previo, cualquier gesto cuenta. */
internal fun movedEnough(
    before: GeoPoint?,
    after: GeoPoint,
): Boolean = before == null || haversineKm(before, after) * METERS_PER_KM >= MIN_MOVE_M

/** Un rectángulo en grados: hasta dónde puede llegar el centro de la cámara. */
internal data class GeoBounds(
    val south: Double,
    val west: Double,
    val north: Double,
    val east: Double,
) {
    fun contains(point: GeoPoint): Boolean = point.lat in south..north && point.lng in west..east
}

/**
 * Hasta dónde puede llegar el centro de la cámara: el rectángulo del polígono de reparto y un 25 % más por cada lado
 * (CUS-ADR-008). Con un círculo, el cuadrado que lo contiene con el mismo margen.
 */
internal fun CoverageArea.cameraBounds(): GeoBounds =
    when (this) {
        is CoverageArea.Polygon -> {
            expanded(
                vertices.minOf { it.lat },
                vertices.minOf { it.lng },
                vertices.maxOf { it.lat },
                vertices.maxOf { it.lng },
            )
        }

        is CoverageArea.Circle -> {
            val dLat = Math.toDegrees(radiusKm / EARTH_KM)
            val dLng = dLat / max(Math.cos(Math.toRadians(center.lat)), MIN_COS)
            expanded(center.lat - dLat, center.lng - dLng, center.lat + dLat, center.lng + dLng)
        }
    }

private const val EARTH_KM = 6371.0
private const val MIN_COS = 0.01

private fun expanded(
    south: Double,
    west: Double,
    north: Double,
    east: Double,
): GeoBounds {
    val padLat = (north - south) * BOUNDS_MARGIN
    val padLng = (east - west) * BOUNDS_MARGIN
    return GeoBounds(south - padLat, west - padLng, north + padLat, east + padLng)
}

/** Los cuatro aspectos del panel de abajo del mapa. */
internal enum class MapPanel { Idle, Moving, Settled, Outside }

/**
 * Qué dice el panel. Mientras el mapa se mueve (por gesto o por la animación hacia el GPS) manda «Ubicando…»; quieto y
 * sin punto, la invitación a mover el mapa; quieto con punto, dentro o fuera de la zona.
 */
internal fun mapPanel(
    point: GeoPoint?,
    moving: Boolean,
    area: CoverageArea,
): MapPanel =
    when {
        moving -> MapPanel.Moving
        point == null -> MapPanel.Idle
        !area.contains(point) -> MapPanel.Outside
        else -> MapPanel.Settled
    }

/** Solo en el panel quieto y dentro de la zona se puede confirmar. */
internal val MapPanel.canConfirm: Boolean get() = this == MapPanel.Settled

/** ¿La lectura del GPS es peor que lo que pide la configuración? Sin precisión conocida no se avisa. */
internal fun isImprecise(
    accuracyM: Float?,
    maxAccuracyM: Float,
): Boolean = accuracyM != null && accuracyM > maxAccuracyM
