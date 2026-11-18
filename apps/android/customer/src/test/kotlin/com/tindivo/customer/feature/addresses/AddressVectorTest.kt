package com.tindivo.customer.feature.addresses

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Recorre el vector compartido con la web (`packages/contracts/fixtures/vectores/direccion.json`).
 * La copia de este recurso debe ser idéntica a la original: lo comprueba el test de Vitest
 * `direccion-vector.test.ts`. Un caso con `"discrepa": "android"` se salta y se reporta.
 */
class AddressVectorTest {
    private val casos =
        Json
            .parseToJsonElement(
                requireNotNull(javaClass.getResourceAsStream("/fixtures/vectores/direccion.json")) {
                    "falta el recurso fixtures/vectores/direccion.json"
                }.bufferedReader().readText(),
            ).jsonArray
            .map { it.jsonObject }

    private fun recorrer(
        ca: (String) -> Boolean,
        regla: (String, String) -> Boolean,
    ) {
        var comprobados = 0
        for (caso in casos) {
            val id = caso.getValue("id").jsonPrimitive.content
            if (!ca(id) || caso["discrepa"] != null) continue
            val campo = caso.getValue("campo").jsonPrimitive.content
            val valor = caso.getValue("valor").jsonPrimitive.content
            val valido = caso.getValue("valido").jsonPrimitive.boolean
            assertEquals("$id: ${caso.getValue("motivo").jsonPrimitive.content}", valido, regla(campo, valor))
            comprobados++
        }
        assertTrue("el vector no trae casos para esta regla", comprobados > 0)
    }

    private fun regla(
        campo: String,
        valor: String,
    ): Boolean = if (campo == "linea") isLineOk(valor) else isReferenceOk(valor)

    @Test
    fun `CA-ADR-01 · el minimo y el maximo de calle y referencia coinciden con el vector compartido`() =
        recorrer({ it.contains("min") || it.contains("max") }, ::regla)

    @Test
    fun `CA-ADR-02 · el texto basura de calle y referencia coincide con el vector compartido`() =
        recorrer({ !it.contains("min") && !it.contains("max") }, ::regla)
}
