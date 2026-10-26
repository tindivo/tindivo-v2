package com.tindivo.customer.feature.cart

import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.math.BigDecimal

@OptIn(ExperimentalCoroutinesApi::class)
class CartStoreTest {
    @get:Rule
    val folder = TemporaryFolder()

    private fun file() = File(folder.root, "tindivo_cart.json")

    private fun TestScope.store(file: File = file()) =
        CartStore(
            DataStoreFactory.create(
                serializer = CartSerializer,
                corruptionHandler = ReplaceFileCorruptionHandler<CartSnapshot?>(produceNewData = { null }),
                scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler)),
                produceFile = { file },
            ),
        )

    private fun line(
        itemId: String = "plato",
        price: String = "12.50",
        quantity: Int = 1,
    ) = CartLine(itemId, "Lomo", BigDecimal(price), emptyList(), null, quantity, null)

    @Test
    fun `sin nada guardado no hay bolsa`() =
        runTest {
            assertNull(store().cart.first())
        }

    @Test
    fun `agregar escribe los importes del archivo como cadena`() =
        runTest {
            val result = store().add("n", "Pollería", line(quantity = 2))

            assertTrue(result is AddResult.Added)
            val text = file().readText()
            assertTrue(text, text.contains("\"basePrice\":\"12.50\""))
        }

    @Test
    fun `la misma firma suma y un plato de otro negocio no toca la bolsa`() =
        runTest {
            val store = store()
            store.add("n", "Pollería", line(quantity = 2))
            store.add("n", "Pollería", line(quantity = 3))
            val other = store.add("m", "Chifa", line(itemId = "arroz"))

            assertEquals(AddResult.OtherBusiness("Pollería"), other)
            val cart = checkNotNull(store.cart.first())
            assertEquals(5, cart.count)
            assertEquals("n", cart.businessId)
        }

    @Test
    fun `replace empieza una bolsa nueva del otro negocio`() =
        runTest {
            val store = store()
            store.add("n", "Pollería", line())
            store.replace("m", "Chifa", line(itemId = "arroz"))

            val cart = checkNotNull(store.cart.first())
            assertEquals("Chifa", cart.businessName)
            assertEquals(listOf("arroz"), cart.lines.map { it.itemId })
        }

    @Test
    fun `cambiar la cantidad, quitar y vaciar`() =
        runTest {
            val store = store()
            store.add("n", "Pollería", line("a"))
            store.add("n", "Pollería", line("b"))
            val signature = checkNotNull(store.cart.first()).lines[0].signature

            store.setQuantity(signature, 4)
            assertEquals(5, checkNotNull(store.cart.first()).count)

            store.remove(signature)
            assertEquals(listOf("b"), checkNotNull(store.cart.first()).lines.map { it.itemId })

            store.remove(checkNotNull(store.cart.first()).lines.single().signature)
            assertNull(store.cart.first())

            store.add("n", "Pollería", line())
            store.clear()
            assertNull(store.cart.first())
        }

    @Test
    fun `dos agregados a la vez no se pisan`() =
        runTest {
            val store = store()
            List(10) { async { store.add("n", "Pollería", line()) } }.awaitAll()

            assertEquals(10, checkNotNull(store.cart.first()).count)
        }

    @Test
    fun `un archivo corrupto se reemplaza por sin bolsa`() =
        runTest {
            file().writeText("{ esto no es json")
            val store = store()

            assertNull(store.cart.first())
            store.add("n", "Pollería", line())
            assertEquals(1, checkNotNull(store.cart.first()).count)
        }

    @Test
    fun `una bolsa guardada que rompe las reglas se lee como sin bolsa y se reemplaza al escribir`() =
        runTest {
            file().writeText(
                "{\"version\":1,\"businessId\":\"n\",\"businessName\":\"N\",\"lines\":[{\"itemId\":\"a\"," +
                    "\"name\":\"A\",\"basePrice\":\"1.005\",\"modifiers\":[],\"note\":null,\"quantity\":1," +
                    "\"imageUrl\":null}]}",
            )
            val store = store()

            assertNull(store.cart.first())
            store.add("m", "Chifa", line())
            assertEquals("m", checkNotNull(store.cart.first()).businessId)
        }
}
