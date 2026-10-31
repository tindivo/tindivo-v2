package com.tindivo.customer.feature.addresses

import com.tindivo.core.network.generated.model.GetCourierTracking200ResponseOriginCoordinates
import com.tindivo.core.network.generated.model.GetPublicConfig200ResponseData
import com.tindivo.core.network.generated.model.GetPublicConfig200ResponseDataCoverage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class CoverageTest {
    // Un cuadrado de 0,02° de lado alrededor de (-9.15, -78.50).
    private val square =
        listOf(
            GeoPoint(-9.14, -78.51),
            GeoPoint(-9.14, -78.49),
            GeoPoint(-9.16, -78.49),
            GeoPoint(-9.16, -78.51),
        )

    // Un polígono cóncavo en «U»: el hueco queda abierto hacia arriba.
    private val u =
        listOf(
            GeoPoint(0.0, 0.0),
            GeoPoint(0.0, 3.0),
            GeoPoint(2.0, 3.0),
            GeoPoint(2.0, 2.0),
            GeoPoint(1.0, 2.0),
            GeoPoint(1.0, 1.0),
            GeoPoint(2.0, 1.0),
            GeoPoint(2.0, 0.0),
        )

    @Test
    fun `un punto dentro del poligono esta dentro`() {
        assertTrue(isInsideCoverage(-9.15, -78.50, square))
    }

    @Test
    fun `un punto fuera del poligono esta fuera`() {
        assertFalse(isInsideCoverage(-9.20, -78.50, square))
        assertFalse(isInsideCoverage(-9.15, -78.40, square))
        assertFalse(isInsideCoverage(-9.10, -78.60, square))
    }

    @Test
    fun `un punto pegado al borde se decide por dentro o fuera sin romperse`() {
        // Justo adentro y justo afuera de un lado (a 1e-6 grados, ~0,1 m).
        assertTrue(isInsideCoverage(-9.15, -78.490001, square))
        assertFalse(isInsideCoverage(-9.15, -78.489999, square))
        // Sobre el lado exacto no se promete un lado, pero responde (no lanza ni da NaN).
        isInsideCoverage(-9.15, -78.49, square)
    }

    @Test
    fun `un poligono degenerado deja todo fuera`() {
        assertFalse(isInsideCoverage(0.0, 0.0, emptyList()))
        assertFalse(isInsideCoverage(0.0, 0.0, listOf(GeoPoint(0.0, 0.0))))
        assertFalse(isInsideCoverage(0.5, 0.5, listOf(GeoPoint(0.0, 0.0), GeoPoint(1.0, 1.0))))
        // Tres puntos en una recta: area cero.
        assertFalse(isInsideCoverage(0.5, 0.2, listOf(GeoPoint(0.0, 0.0), GeoPoint(1.0, 1.0), GeoPoint(2.0, 2.0))))
    }

    @Test
    fun `un poligono concavo deja fuera el hueco`() {
        assertTrue(isInsideCoverage(0.5, 0.5, u))
        assertTrue(isInsideCoverage(0.5, 2.5, u))
        assertFalse(isInsideCoverage(1.5, 1.5, u))
    }

    @Test
    fun `el circulo de respaldo cubre el centro de San Jacinto y deja fuera a Chimbote`() {
        val area = CoverageArea.Fallback
        assertTrue(area.contains(GeoPoint(-9.1547, -78.5042)))
        assertFalse(area.contains(GeoPoint(-9.0745, -78.5936)))
    }

    @Test
    fun `from prefiere el poligono con tres vertices, luego el circulo y al final el respaldo`() {
        fun config(
            polygon: List<GetCourierTracking200ResponseOriginCoordinates>?,
            circle: GetPublicConfig200ResponseDataCoverage?,
        ) = GetPublicConfig200ResponseData(circle, polygon, null, null, null, null, null, null)
        val ring =
            square.map {
                GetCourierTracking200ResponseOriginCoordinates(BigDecimal.valueOf(it.lat), BigDecimal.valueOf(it.lng))
            }
        val circle = GetPublicConfig200ResponseDataCoverage(BigDecimal("-9.15"), BigDecimal("-78.5"), BigDecimal("1"))

        assertTrue(CoverageArea.from(config(ring, circle)) is CoverageArea.Polygon)
        assertTrue(CoverageArea.from(config(ring.take(2), circle)) is CoverageArea.Circle)
        assertTrue(CoverageArea.from(config(null, circle)) is CoverageArea.Circle)
        assertEquals(CoverageArea.Fallback, CoverageArea.from(config(null, null)))
        assertEquals(CoverageArea.Fallback, CoverageArea.from(null))
    }
}
