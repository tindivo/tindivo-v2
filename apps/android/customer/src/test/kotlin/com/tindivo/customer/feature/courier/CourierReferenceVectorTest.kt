package com.tindivo.customer.feature.courier

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La referencia de cada punto de Entregas sigue el vector compartido de direcciones
 * (`packages/contracts/fixtures/vectores/direccion.json`, campo «referencia»): el mismo largo y el mismo texto basura
 * que el servidor. Un caso con `"discrepa"` se salta, como en `AddressVectorTest`.
 */
class CourierReferenceVectorTest {
    private val casos =
        Json
            .parseToJsonElement(
                requireNotNull(javaClass.getResourceAsStream("/fixtures/vectores/direccion.json")) {
                    "falta el recurso fixtures/vectores/direccion.json"
                }.bufferedReader().readText(),
            ).jsonArray
            .map { it.jsonObject }
            .filter { it.getValue("campo").jsonPrimitive.content == "referencia" && it["discrepa"] == null }

    @Test
    fun `CA-ENT-02 · la referencia de un punto coincide con el vector compartido`() {
        assertTrue("el vector no trae casos de referencia", casos.isNotEmpty())
        for (caso in casos) {
            val id = caso.getValue("id").jsonPrimitive.content
            val punto = CourierPointDraft(reference = caso.getValue("valor").jsonPrimitive.content)
            assertEquals(
                "$id: ${caso.getValue("motivo").jsonPrimitive.content}",
                caso.getValue("valido").jsonPrimitive.boolean,
                punto.referenceOk,
            )
        }
    }

    @Test
    fun `CA-ENT-02 · una referencia basura de largo suficiente no deja continuar`() {
        assertFalse(CourierPointDraft(reference = "a".repeat(20)).referenceOk)
        assertFalse(CourierPointDraft(reference = "1234567890123456").referenceOk)
        assertFalse(CourierPointDraft(reference = "asdfasdfasdfasdf").referenceOk)
        assertTrue(CourierPointDraft(reference = "puerta azul, frente al mercado").referenceOk)
    }
}
