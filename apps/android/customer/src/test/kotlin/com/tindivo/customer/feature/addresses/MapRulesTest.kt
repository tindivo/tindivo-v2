package com.tindivo.customer.feature.addresses

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Las reglas puras del mapa de dirección: el filtro de 3 m, los límites de la cámara, el panel y la precisión. */
internal class MapRulesTest {
    private val center = GeoPoint(-9.1547, -78.5042)

    // Un grado de latitud son unos 111 km: 0,00002° son ~2,2 m y 0,00004° son ~4,4 m.
    private fun northBy(
        degrees: Double,
        from: GeoPoint = center,
    ) = GeoPoint(from.lat + degrees, from.lng)

    @Test
    fun `un gesto que mueve el centro menos de 3 m no fija punto`() {
        assertFalse(movedEnough(center, northBy(0.00002)))
        assertFalse(movedEnough(center, center))
    }

    @Test
    fun `un gesto que mueve el centro 3 m o mas si fija punto`() {
        assertTrue(movedEnough(center, northBy(0.00004)))
        assertTrue(movedEnough(center, northBy(0.001)))
    }

    @Test
    fun `sin centro previo cualquier gesto cuenta`() {
        assertTrue(movedEnough(null, center))
    }

    private val square =
        CoverageArea.Polygon(
            listOf(GeoPoint(-9.10, -78.60), GeoPoint(-9.10, -78.40), GeoPoint(-9.20, -78.40), GeoPoint(-9.20, -78.60)),
        )

    @Test
    fun `la camara llega al poligono mas un 25 por ciento por cada lado`() {
        val bounds = square.cameraBounds()

        // El rectángulo mide 0,10° de alto y 0,20° de ancho: el margen es 0,025° y 0,05°.
        assertEquals(-9.225, bounds.south, EPS)
        assertEquals(-9.075, bounds.north, EPS)
        assertEquals(-78.65, bounds.west, EPS)
        assertEquals(-78.35, bounds.east, EPS)
    }

    @Test
    fun `un punto dentro del margen se puede ver y uno mas lejos no`() {
        val bounds = square.cameraBounds()

        assertTrue(bounds.contains(GeoPoint(-9.21, -78.62)))
        assertFalse(bounds.contains(GeoPoint(-9.30, -78.50)))
    }

    @Test
    fun `con una zona en circulo la camara llega al cuadrado del radio mas un 25 por ciento`() {
        val bounds = CoverageArea.Circle(center, radiusKm = 3.0).cameraBounds()

        // 3 km son ~0,027° de latitud; con el margen del 25 % de un lado de 0,054° quedan ~0,0405°.
        assertTrue(bounds.contains(northBy(0.035)))
        assertFalse(bounds.contains(northBy(0.05)))
        assertTrue(bounds.north > center.lat && bounds.south < center.lat)
    }

    @Test
    fun `el zoom va de 14 a 20 y al fijar un punto es 18`() {
        assertEquals(14f, MIN_ZOOM)
        assertEquals(20f, MAX_ZOOM)
        assertEquals(18f, FIX_ZOOM)
        assertEquals(17f, SUMMARY_ZOOM)
    }

    @Test
    fun `el panel sin punto invita a mover el mapa`() {
        assertEquals(MapPanel.Idle, mapPanel(null, moving = false, area = square))
    }

    @Test
    fun `mientras el mapa se mueve el panel dice ubicando aunque haya punto`() {
        assertEquals(MapPanel.Moving, mapPanel(null, moving = true, area = square))
        assertEquals(MapPanel.Moving, mapPanel(GeoPoint(-9.15, -78.5), moving = true, area = square))
    }

    @Test
    fun `quieto y dentro de la zona el panel pregunta y deja confirmar`() {
        val panel = mapPanel(GeoPoint(-9.15, -78.5), moving = false, area = square)

        assertEquals(MapPanel.Settled, panel)
        assertTrue(panel.canConfirm)
    }

    @Test
    fun `quieto y fuera de la zona no se puede confirmar`() {
        val panel = mapPanel(GeoPoint(-9.0, -78.0), moving = false, area = square)

        assertEquals(MapPanel.Outside, panel)
        assertFalse(panel.canConfirm)
    }

    @Test
    fun `solo el panel quieto y dentro puede confirmar`() {
        assertEquals(listOf(MapPanel.Settled), MapPanel.entries.filter { it.canConfirm })
    }

    @Test
    fun `la precision peor que el umbral es imprecisa y la igual o mejor no`() {
        assertTrue(isImprecise(31f, 30f))
        assertFalse(isImprecise(30f, 30f))
        assertFalse(isImprecise(8f, 30f))
        assertFalse(isImprecise(null, 30f))
    }

    private companion object {
        const val EPS = 1e-9
    }
}
