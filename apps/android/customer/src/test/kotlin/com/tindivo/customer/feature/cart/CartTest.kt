package com.tindivo.customer.feature.cart

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class CartTest {
    private fun line(
        itemId: String = "plato",
        price: String = "12.50",
        modifiers: List<CartModifier> = emptyList(),
        note: String? = null,
        quantity: Int = 1,
        name: String = "Lomo saltado",
    ) = CartLine(itemId, name, BigDecimal(price), modifiers, note, quantity, imageUrl = null)

    private fun mod(
        id: String,
        price: String,
    ) = CartModifier(id, "Extras", id, BigDecimal(price))

    private fun added(result: AddResult) = (result as AddResult.Added)

    @Test
    fun `el subtotal es exacto en centimos sin pasar por double`() {
        // 0.10 + 0.20 en Double da 0.30000000000000004: aquí tiene que dar 0.30 exacto.
        val cart = Cart("n", "Negocio", listOf(line("a", "0.10"), line("b", "0.20")))
        assertEquals(0, BigDecimal("0.30").compareTo(cart.subtotal))
        val many = Cart("n", "Negocio", List(3) { line("x$it", "33.33", quantity = 3) })
        assertEquals(BigDecimal("299.97"), many.subtotal)
    }

    @Test
    fun `el precio unitario suma las opciones y el total multiplica por la cantidad`() {
        val withOptions =
            line(price = "18.00", modifiers = listOf(mod("queso", "2.50"), mod("palta", "0.00")), quantity = 3)
        assertEquals(BigDecimal("20.50"), withOptions.unitPrice)
        assertEquals(BigDecimal("61.50"), withOptions.total)
        assertEquals(3, Cart("n", "Negocio", listOf(withOptions)).count)
    }

    @Test
    fun `la misma firma suma cantidades y se queda con el precio mas reciente`() {
        val first = added(addToCart(null, "n", "Negocio", line(quantity = 2))).cart
        val second = added(addToCart(first, "n", "Negocio", line(price = "13.00", quantity = 3))).cart
        assertEquals(1, second.lines.size)
        assertEquals(5, second.lines.single().quantity)
        assertEquals(BigDecimal("13.00"), second.lines.single().basePrice)
    }

    @Test
    fun `la firma ignora el orden y las mayusculas de las opciones y los bordes de la nota`() {
        val a = line(modifiers = listOf(mod("B", "1.00"), mod("a", "1.00")), note = " sin cebolla ")
        val b = line(modifiers = listOf(mod("A", "1.00"), mod("b", "1.00")), note = "sin cebolla")
        assertEquals(a.signature, b.signature)
        assertFalse(a.signature == line(note = "sin ají").signature)
        assertFalse(a.signature == line(modifiers = listOf(mod("a", "1.00"))).signature)
    }

    @Test
    fun `otra nota u otras opciones son otra linea`() {
        val cart = added(addToCart(null, "n", "Negocio", line())).cart
        val withNote = added(addToCart(cart, "n", "Negocio", line(note = "bien cocido"))).cart
        assertEquals(2, withNote.lines.size)
    }

    @Test
    fun `la suma no pasa de 50 y lo avisa`() {
        val cart = added(addToCart(null, "n", "Negocio", line(quantity = 40))).cart
        val result = added(addToCart(cart, "n", "Negocio", line(quantity = 20)))
        assertTrue(result.capped)
        assertEquals(
            MAX_QUANTITY,
            result.cart.lines
                .single()
                .quantity,
        )
        assertFalse(added(addToCart(cart, "n", "Negocio", line(quantity = 10))).capped)
    }

    @Test
    fun `un plato de otro negocio no toca la bolsa`() {
        val cart = added(addToCart(null, "n1", "Pollería", line())).cart
        assertEquals(AddResult.OtherBusiness("Pollería"), addToCart(cart, "n2", "Chifa", line()))
        val fresh = replacedWith("n2", "Chifa", line(itemId = "arroz"))
        assertEquals("n2", fresh.businessId)
        assertEquals(listOf("arroz"), fresh.lines.map { it.itemId })
    }

    @Test
    fun `el mismo negocio con el uuid en mayusculas es el mismo negocio`() {
        val id = "abcdefab-1234-4000-8000-abcdef123456"
        val cart = added(addToCart(null, id, "Negocio", line())).cart
        assertTrue(addToCart(cart, id.uppercase(), "Negocio", line()) is AddResult.Added)
    }

    @Test
    fun `una bolsa vacia acepta cualquier negocio`() {
        val empty = Cart("n1", "Pollería", emptyList())
        assertEquals("n2", added(addToCart(empty, "n2", "Chifa", line())).cart.businessId)
    }

    @Test
    fun `la cantidad se mantiene entre 1 y 50 y quitar la linea la borra`() {
        val cart = Cart("n", "Negocio", listOf(line(quantity = 2)))
        val sig = cart.lines.single().signature
        assertEquals(
            1,
            cart
                .setQuantity(sig, 0)
                .lines
                .single()
                .quantity,
        )
        assertEquals(
            MAX_QUANTITY,
            cart
                .setQuantity(sig, 99)
                .lines
                .single()
                .quantity,
        )
        assertTrue(cart.removeLine(sig).isEmpty())
    }

    @Test(expected = IllegalArgumentException::class)
    fun `no se anade una linea con cantidad fuera de rango`() {
        addToCart(null, "n", "Negocio", line(quantity = 0))
    }

    @Test
    fun `la nota se guarda sin bordes, vacia es null y no pasa de 140`() {
        assertEquals("sin cebolla", normalizeNote("  sin cebolla \n"))
        assertNull(normalizeNote("   "))
        assertEquals(MAX_NOTE_LENGTH, normalizeNote("a".repeat(200))?.length)
    }
}
