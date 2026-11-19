package com.tindivo.customer.feature.orders

import com.tindivo.customer.R
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Recorre el vector compartido con el contrato (`packages/contracts/fixtures/vectores/seguimiento.json`). Su copia debe
 * ser idéntica al original: lo comprueba `seguimiento-vector.test.ts`.
 */
class TrackingVectorTest {
    private val casos =
        Json
            .parseToJsonElement(
                requireNotNull(javaClass.getResourceAsStream("/fixtures/vectores/seguimiento.json")) {
                    "falta el recurso fixtures/vectores/seguimiento.json"
                }.bufferedReader().readText(),
            ).jsonArray
            .map { it.jsonObject }

    private fun pasoOf(status: String): String =
        when (val phase = orderPhaseOf(status, null)) {
            is OrderPhase.Active -> {
                when (phase.step) {
                    TrackingStep.Received -> "received"
                    TrackingStep.Preparing -> "preparing"
                    TrackingStep.OnTheWay -> "ontheway"
                    TrackingStep.Delivered -> "delivered"
                }
            }

            OrderPhase.Delivered -> {
                "delivered"
            }

            is OrderPhase.Cancelled -> {
                "cancelled"
            }

            OrderPhase.Unknown -> {
                "unknown"
            }
        }

    @Test
    fun `CA-TRK-03 cada estado del vector da el paso del contrato`() {
        assertTrue(casos.isNotEmpty())
        for (caso in casos) {
            val status = caso.getValue("status").jsonPrimitive.content
            val paso = caso.getValue("paso").jsonPrimitive.content
            assertEquals("$status: ${caso.getValue("motivo").jsonPrimitive.content}", paso, pasoOf(status))
        }
    }

    @Test
    fun `CA-TRK-03 un estado que la app no conoce no inventa un paso`() {
        assertEquals("unknown", pasoOf("estado_nuevo"))
    }

    @Test
    fun `CA-TRK-07 aceptar no mueve el paso de recibido`() {
        assertEquals("received", pasoOf("confirmed"))
        assertEquals("received", pasoOf("awaiting_payment"))
        assertEquals("preparing", pasoOf("preparing"))
    }

    @Test
    fun `CA-ORD-01 la etiqueta de cada estado del vector sale de su paso y no del estado interno`() {
        for (caso in casos) {
            val status = caso.getValue("status").jsonPrimitive.content
            val paso = caso.getValue("paso").jsonPrimitive.content
            val phase = orderPhaseOf(status, null)
            val etiquetas =
                when (paso) {
                    "received" -> setOf(R.string.order_step_received)
                    "preparing" -> setOf(R.string.order_step_preparing)
                    "ontheway" -> setOf(R.string.order_step_on_the_way, R.string.order_step_ready)
                    "delivered" -> setOf(R.string.order_step_delivered)
                    else -> setOf(R.string.order_card_cancelled)
                }
            assertTrue(status, phase.labelRes(isPickup = false) in etiquetas)
            assertTrue(status, phase.labelRes(isPickup = true) in etiquetas)
        }
        assertEquals(R.string.order_step_ready, orderPhaseOf("ready_for_pickup", null).labelRes(isPickup = true))
        assertEquals(R.string.order_step_on_the_way, orderPhaseOf("picked_up", null).labelRes(isPickup = false))
    }
}
