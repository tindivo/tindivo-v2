package com.tindivo.customer.feature.cart

import androidx.datastore.core.CorruptionException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.math.BigDecimal

class CartSnapshotTest {
    private fun line(
        itemId: String = "plato",
        price: String = "12.50",
        modifiers: List<CartModifier> = listOf(CartModifier("queso", "Extras", "Queso", BigDecimal("2.50"))),
        note: String? = "sin cebolla",
        quantity: Int = 2,
    ) = CartLine(itemId, "Lomo saltado", BigDecimal(price), modifiers, note, quantity, imageUrl = "https://img/x.webp")

    private val cart =
        Cart("negocio", "Pollería", listOf(line(), line(itemId = "otro", modifiers = emptyList(), note = null)))

    private fun snapshot() = checkNotNull(cart.toSnapshot())

    private fun lineSnapshot(
        basePrice: String = "12.50",
        quantity: Int = 1,
        modifiers: List<CartModifierSnapshot> = emptyList(),
        note: String? = null,
        itemId: String = "plato",
    ) = CartLineSnapshot(itemId, "Lomo", basePrice, modifiers, note, quantity, null)

    private fun withLines(vararg lines: CartLineSnapshot) = snapshot().copy(lines = lines.toList())

    @Test
    fun `ida y vuelta conserva los importes exactos`() {
        val snapshot = snapshot()
        assertEquals("12.50", snapshot.lines[0].basePrice)
        assertEquals(
            "2.50",
            snapshot.lines[0]
                .modifiers
                .single()
                .price,
        )

        val restored = checkNotNull(snapshot.toCartOrNull())

        assertEquals(cart, restored)
        assertEquals(BigDecimal("12.50"), restored.lines[0].basePrice)
        assertEquals(BigDecimal("15.00"), restored.lines[0].unitPrice)
        assertEquals(cart.subtotal, restored.subtotal)
    }

    @Test
    fun `una bolsa vacia se guarda como sin bolsa`() {
        assertNull(Cart("n", "Negocio", emptyList()).toSnapshot())
    }

    @Test
    fun `una version distinta de 1 descarta la bolsa`() {
        assertNull(snapshot().copy(version = 2).toCartOrNull())
        assertNull(snapshot().copy(version = 0).toCartOrNull())
    }

    @Test
    fun `un importe ilegible o fuera de numeric 10 2 descarta la bolsa`() {
        for (bad in listOf("abc", "", "1.005", "-1", "100000000", "1e2147483647", "NaN")) {
            assertNull(bad, withLines(lineSnapshot(basePrice = bad)).toCartOrNull())
            val modifier = CartModifierSnapshot("queso", "Extras", "Queso", bad)
            assertNull(bad, withLines(lineSnapshot(modifiers = listOf(modifier))).toCartOrNull())
        }
    }

    @Test
    fun `una cantidad fuera de 1 a 50 descarta la bolsa`() {
        assertNull(withLines(lineSnapshot(quantity = 0)).toCartOrNull())
        assertNull(withLines(lineSnapshot(quantity = MAX_QUANTITY + 1)).toCartOrNull())
        assertNull(withLines(lineSnapshot(quantity = -3)).toCartOrNull())
        assertEquals(MAX_QUANTITY, withLines(lineSnapshot(quantity = MAX_QUANTITY)).toCartOrNull()?.count)
    }

    @Test
    fun `mas opciones que el maximo del pedido descartan la bolsa`() {
        fun options(n: Int) = List(n) { CartModifierSnapshot("o$it", "Extras", "Opción $it", "1.00") }
        assertNull(withLines(lineSnapshot(modifiers = options(MAX_MODIFIERS + 1))).toCartOrNull())
        assertTrue(withLines(lineSnapshot(modifiers = options(MAX_MODIFIERS))).toCartOrNull() != null)
    }

    @Test
    fun `una nota de mas de 140 caracteres descarta la bolsa`() {
        assertNull(withLines(lineSnapshot(note = "a".repeat(MAX_NOTE_LENGTH + 1))).toCartOrNull())
        assertTrue(withLines(lineSnapshot(note = "a".repeat(MAX_NOTE_LENGTH))).toCartOrNull() != null)
    }

    @Test
    fun `dos lineas con la misma firma descartan la bolsa`() {
        assertNull(withLines(lineSnapshot(), lineSnapshot()).toCartOrNull())
        assertNull(withLines(lineSnapshot(itemId = "A"), lineSnapshot(itemId = "a")).toCartOrNull())
    }

    @Test
    fun `una opcion repetida en una linea descarta la bolsa entera`() {
        val queso = CartModifierSnapshot("6f1c0000-0000-4000-8000-00000000000a", "Extras", "Queso", "2.50")
        val upper = queso.copy(optionId = queso.optionId.uppercase())
        val valid = lineSnapshot(itemId = "otro")

        assertNull(withLines(valid, lineSnapshot(modifiers = listOf(queso, queso))).toCartOrNull())
        assertNull(withLines(valid, lineSnapshot(modifiers = listOf(queso, upper))).toCartOrNull())
        assertTrue(withLines(valid, lineSnapshot(modifiers = listOf(queso))).toCartOrNull() != null)
    }

    @Test
    fun `mas de 50 platos distintos descartan la bolsa`() {
        fun lines(n: Int) = Array(n) { lineSnapshot(itemId = "p$it") }

        assertEquals(MAX_LINES, withLines(*lines(MAX_LINES)).toCartOrNull()?.lines?.size)
        assertNull(withLines(*lines(MAX_LINES + 1)).toCartOrNull())
    }

    @Test
    fun `sin negocio o sin lineas no hay bolsa`() {
        assertNull(snapshot().copy(businessId = " ").toCartOrNull())
        assertNull(snapshot().copy(lines = emptyList()).toCartOrNull())
    }

    @Test
    fun `el serializador escribe la version y lee lo que escribio`() =
        runTest {
            val out = ByteArrayOutputStream()
            CartSerializer.writeTo(snapshot(), out)

            assertTrue(out.toString(Charsets.UTF_8).contains("\"version\":1"))
            assertEquals(snapshot(), CartSerializer.readFrom(ByteArrayInputStream(out.toByteArray())))

            val none = ByteArrayOutputStream()
            CartSerializer.writeTo(null, none)
            assertNull(CartSerializer.readFrom(ByteArrayInputStream(none.toByteArray())))
        }

    @Test
    fun `el serializador con bytes corruptos lanza CorruptionException`() =
        runTest {
            val corrupt =
                listOf(
                    byteArrayOf(),
                    byteArrayOf(0x00, 0x7F, 0xFF.toByte()),
                    "{\"version\":1,\"businessId\":".encodeToByteArray(),
                    "[]".encodeToByteArray(),
                    // Una clave de más: ignoreUnknownKeys = false.
                    (
                        "{\"version\":1,\"businessId\":\"n\",\"businessName\":\"N\"," +
                            "\"lines\":[],\"extra\":1}"
                    ).encodeToByteArray(),
                    // Un importe como número JSON en vez de cadena.
                    (
                        "{\"version\":1,\"businessId\":\"n\",\"businessName\":\"N\",\"lines\":[{\"itemId\":\"a\"," +
                            "\"name\":\"A\",\"basePrice\":12.5,\"modifiers\":[],\"note\":null,\"quantity\":1," +
                            "\"imageUrl\":null}]}"
                    ).encodeToByteArray(),
                )
            for (bytes in corrupt) {
                val failure = runCatching { CartSerializer.readFrom(ByteArrayInputStream(bytes)) }.exceptionOrNull()
                assertTrue(bytes.decodeToString(), failure is CorruptionException)
            }
        }
}
