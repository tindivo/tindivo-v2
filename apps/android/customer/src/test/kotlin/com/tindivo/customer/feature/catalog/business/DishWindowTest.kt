package com.tindivo.customer.feature.catalog.business

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.OffsetDateTime

/**
 * Los casos de `isWithinWindow` en `packages/contracts/src/__tests__/menu-availability.test.ts`, uno a uno (sin
 * el margen de gracia, que solo usa el servidor al crear el pedido). Lima = UTC-5 fijo, sin horario de verano.
 * Semana de referencia: lunes 2026-07-06 … domingo 2026-07-12.
 */
class DishWindowTest {
    private fun at(
        date: String,
        time: String,
    ) = OffsetDateTime.parse("${date}T$time:00-05:00").toInstant()

    private fun win(
        days: List<Int>? = null,
        from: String? = null,
        to: String? = null,
    ) = DishWindow(days, from, to)

    private val siempre = win()
    private val mediodia = win(days = listOf(5, 6), from = "11:00", to = "15:00")
    private val noche = win(days = listOf(0, 1, 2, 3, 4, 5), from = "18:00", to = "23:30")
    private val trasnoche = win(days = listOf(5), from = "22:00", to = "02:00")

    @Test
    fun `sin restriccion el plato siempre se ve`() {
        assertTrue(siempre.isOpenAt(at(TUE, "20:00")))
        assertTrue(win(days = listOf(0, 1, 2, 3, 4, 5, 6)).isOpenAt(at(TUE, "20:00")))
    }

    @Test
    fun `la carta de mediodia se ve el fin de semana a mediodia`() {
        assertTrue(mediodia.isOpenAt(at(SAT, "12:00")))
        assertTrue(mediodia.isOpenAt(at(SUN, "12:00")))
    }

    @Test
    fun `la apertura entra y el cierre no`() {
        assertTrue(mediodia.isOpenAt(at(SAT, "11:00")))
        assertFalse(mediodia.isOpenAt(at(SAT, "10:59")))
        assertTrue(mediodia.isOpenAt(at(SAT, "14:59")))
        assertFalse(mediodia.isOpenAt(at(SAT, "15:00")))
    }

    @Test
    fun `la carta de mediodia no se ve de noche ni entre semana`() {
        assertFalse(mediodia.isOpenAt(at(SAT, "20:00")))
        assertFalse(mediodia.isOpenAt(at(TUE, "12:00")))
        assertFalse(mediodia.isOpenAt(at(TUE, "20:00")))
    }

    @Test
    fun `la carta de noche es la complementaria`() {
        assertTrue(noche.isOpenAt(at(MON, "20:00")))
        assertTrue(noche.isOpenAt(at(SAT, "20:00")))
        assertFalse(noche.isOpenAt(at(SAT, "12:00")))
        assertFalse(noche.isOpenAt(at(SUN, "20:00")))
    }

    @Test
    fun `solo dias vale todo el dia en esos dias`() {
        val soloFinde = win(days = listOf(5, 6))
        assertTrue(soloFinde.isOpenAt(at(SAT, "06:00")))
        assertTrue(soloFinde.isOpenAt(at(SAT, "23:59")))
        assertFalse(soloFinde.isOpenAt(at(FRI, "12:00")))
    }

    @Test
    fun `solo horas vale esa franja todos los dias`() {
        val soloTarde = win(from = "11:00", to = "15:00")
        assertTrue(soloTarde.isOpenAt(at(TUE, "12:00")))
        assertTrue(soloTarde.isOpenAt(at(SAT, "12:00")))
        assertFalse(soloTarde.isOpenAt(at(TUE, "20:00")))
    }

    @Test
    fun `con media franja manda el dia`() {
        val aMedias = win(days = listOf(5, 6), from = "11:00")
        assertTrue(aMedias.isOpenAt(at(SAT, "20:00")))
        assertFalse(aMedias.isOpenAt(at(TUE, "20:00")))
    }

    @Test
    fun `la franja que cruza medianoche es del dia en que empieza`() {
        assertTrue(trasnoche.isOpenAt(at(SAT, "23:00")))
        assertTrue(trasnoche.isOpenAt(at(SUN, "01:00")))
        assertFalse(trasnoche.isOpenAt(at(SUN, "02:00")))
        assertFalse(trasnoche.isOpenAt(at(SUN, "03:00")))
        assertFalse(trasnoche.isOpenAt(at(SAT, "21:59")))
    }

    @Test
    fun `el dia se juzga en hora de Lima y no en UTC`() {
        // 2026-07-12T03:00:00Z es sábado 11 a las 22:00 en Lima (domingo en UTC).
        val utcNow = OffsetDateTime.parse("2026-07-12T03:00:00Z").toInstant()
        assertTrue(win(days = listOf(5), from = "18:00", to = "23:00").isOpenAt(utcNow))
        assertFalse(win(days = listOf(6), from = "18:00", to = "23:00").isOpenAt(utcNow))
    }

    @Test
    fun `acepta la hora de Postgres con segundos`() {
        val conSegundos = win(days = listOf(5, 6), from = "11:00:00", to = "15:00:00")
        assertTrue(conSegundos.isOpenAt(at(SAT, "12:00")))
        assertFalse(conSegundos.isOpenAt(at(TUE, "12:00")))
    }

    @Test
    fun `un dato roto nunca esconde el plato`() {
        assertTrue(win(days = emptyList()).isOpenAt(at(TUE, "20:00")))
        assertTrue(win(from = "media tarde", to = "15:00").isOpenAt(at(TUE, "20:00")))
        assertTrue(win(from = "24:00", to = "15:00").isOpenAt(at(TUE, "20:00")))
        assertTrue(win(days = listOf(5, 6, 99)).isOpenAt(at(SAT, "12:00")))
        assertFalse(win(days = listOf(5, 6, 99)).isOpenAt(at(TUE, "12:00")))
        assertTrue(win(days = listOf(99)).isOpenAt(at(TUE, "12:00")))
    }

    private companion object {
        const val MON = "2026-07-06"
        const val TUE = "2026-07-07"
        const val FRI = "2026-07-10"
        const val SAT = "2026-07-11"
        const val SUN = "2026-07-12"
    }
}
