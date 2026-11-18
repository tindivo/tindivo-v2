package com.tindivo.customer.feature.cart

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

/**
 * Recorre el vector compartido con la web (`packages/contracts/fixtures/vectores/bolsa.json`). La copia de este
 * recurso debe ser idéntica a la original: lo comprueba el test de Vitest `bolsa-vector.test.ts`, que además fija los
 * topes del vector contra `packages/contracts/src/cart.ts`.
 */
class CartVectorTest {
    private val vector: JsonObject =
        Json
            .parseToJsonElement(
                requireNotNull(javaClass.getResourceAsStream("/fixtures/vectores/bolsa.json")) {
                    "falta el recurso fixtures/vectores/bolsa.json"
                }.bufferedReader().readText(),
            ).jsonObject

    private fun JsonElement.text() = jsonPrimitive.content

    private fun line(
        itemId: String,
        quantity: Int = 1,
        price: BigDecimal = BigDecimal("1.00"),
        modifiers: List<CartModifier> = emptyList(),
    ) = CartLine(itemId, "Plato $itemId", price, modifiers, null, quantity, null)

    private fun JsonObject.cases(key: String) = getValue(key).jsonArray.map { it.jsonObject }

    @Test
    fun `CA-CRT-09 · los topes de Kotlin son los del vector compartido`() {
        val topes = vector.getValue("topes").jsonObject
        assertEquals(topes.getValue("CART_MAX_LINES").jsonPrimitive.int, MAX_LINES)
        assertEquals(topes.getValue("CART_MAX_QUANTITY").jsonPrimitive.int, MAX_QUANTITY)
        assertEquals(topes.getValue("CART_MAX_MODIFIERS").jsonPrimitive.int, MAX_MODIFIERS)
    }

    @Test
    fun `CA-CRT-06 · el subtotal de cada caso del vector es exacto y un precio con tres decimales se rechaza`() {
        var checked = 0
        for (case in vector.cases("montos")) {
            val id = case.getValue("id").text()
            val reason = case.getValue("motivo").text()
            val lines =
                case.cases("lineas").mapIndexed { n, raw ->
                    val base = raw.getValue("precioBase").text().toBigDecimal()
                    val options = raw.getValue("opciones").jsonArray.map { it.text().toBigDecimal() }
                    val modifiers = options.mapIndexed { i, price -> CartModifier("o$i", "Extras", "Opcion $i", price) }
                    line("l$n", raw.getValue("cantidad").jsonPrimitive.int, base, modifiers)
                }
            val prices = lines.flatMap { listOf(it.basePrice) + it.modifiers.map { m -> m.price } }
            val valid = prices.all { menuPriceOrNull(it) != null }
            assertEquals("$id: $reason", case.getValue("valido").jsonPrimitive.boolean, valid)
            if (valid) {
                val expected = BigDecimal(case.getValue("subtotal").text())
                val subtotal = Cart("n", "Negocio", lines).subtotal
                assertEquals("$id: $reason", 0, expected.compareTo(subtotal))
                assertEquals(id, formatSoles(expected), requireAmountText(subtotal))
            }
            checked++
        }
        assertTrue("el vector no trae casos de montos", checked > 0)
    }

    @Test
    fun `CA-CRT-09 · la bolsa no deja pasar de los topes de lineas, cantidad y opciones del vector`() {
        var checked = 0
        for (case in vector.cases("excesos")) {
            val id = case.getValue("id").text()
            val value = case.getValue("valor").jsonPrimitive.int
            val valid = case.getValue("valido").jsonPrimitive.boolean
            val reason = "$id: ${case.getValue("motivo").text()}"
            when (case.getValue("tope").text()) {
                "CART_MAX_LINES" -> assertEquals(reason, valid, linesFit(value))
                "CART_MAX_QUANTITY" -> assertEquals(reason, valid, quantityFits(value))
                "CART_MAX_MODIFIERS" -> assertEquals(reason, valid, modifiersFit(value))
                else -> error("tope desconocido en el vector: $id")
            }
            checked++
        }
        assertTrue("el vector no trae casos de topes", checked > 0)
    }

    /** Se agregan [count] platos distintos: caben si ninguno se rechaza con [AddResult.Full]. */
    private fun linesFit(count: Int): Boolean {
        var cart: Cart? = null
        repeat(count) { i ->
            when (val result = addToCart(cart, "n", "Negocio", line("plato$i"))) {
                is AddResult.Added -> cart = result.cart
                else -> return false
            }
        }
        return true
    }

    /** La cantidad cabe si [addToCart] la acepta y la bolsa guardada se puede volver a leer. */
    private fun quantityFits(quantity: Int): Boolean {
        val added =
            try {
                addToCart(null, "n", "Negocio", line("plato", quantity))
            } catch (expected: IllegalArgumentException) {
                return false
            }
        val cart = (added as AddResult.Added).cart
        return cart.toSnapshot()?.toCartOrNull() == cart
    }

    /** Las opciones caben si la bolsa guardada con ellas se vuelve a leer entera. */
    private fun modifiersFit(count: Int): Boolean {
        val modifiers = List(count) { CartModifier("opcion$it", "Extras", "Opcion $it", BigDecimal("0.10")) }
        val cart = Cart("n", "Negocio", listOf(line("plato", modifiers = modifiers)))
        return cart.toSnapshot()?.toCartOrNull() == cart
    }
}
