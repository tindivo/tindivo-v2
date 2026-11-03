package com.tindivo.customer.feature.cart

import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.math.BigDecimal

/**
 * La bolsa con la que una cuenta intentó enviar un pedido no pasa a otra: cada operación es un único `updateData` y la
 * reserva viaja en el mismo archivo que la bolsa.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CartStoreReservationTest {
    @get:Rule
    val folder = TemporaryFolder()

    private fun file() = File(folder.root, "tindivo_cart.json")

    private fun TestScope.storeOn(target: File = file()) =
        CartStore(
            DataStoreFactory.create(
                serializer = CartSerializer,
                corruptionHandler = ReplaceFileCorruptionHandler<CartSnapshot?>(produceNewData = { null }),
                scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler)),
                produceFile = { target },
            ),
        )

    private fun line(
        itemId: String = "plato",
        quantity: Int = 1,
    ) = CartLine(itemId, "Lomo", BigDecimal("12.50"), emptyList(), null, quantity, null)

    private fun cartOf(quantity: Int = 1) = Cart("n", "Pollería", listOf(line(quantity = quantity)))

    private val fingerprint = cartOf().fingerprint()

    private suspend fun CartStore.filled() = add("n", "Pollería", line())

    /** Lo que quedó escrito en el archivo, leído con el serializador real. */
    private suspend fun storedSnapshot(target: File = file()): CartSnapshot? =
        target.inputStream().use { CartSerializer.readFrom(it) }

    private suspend fun storedReservation() = storedSnapshot()?.reservation

    @Test
    fun `reserve sin bolsa o con otra huella da Changed y no escribe nada`() =
        runTest {
            val store = storeOn()
            assertEquals(ReserveResult.Changed, store.reserve("a", fingerprint))

            store.filled()
            assertEquals(ReserveResult.Changed, store.reserve("a", cartOf(quantity = 2).fingerprint()))
            assertNull(storedReservation())
        }

    @Test
    fun `reserve con la huella vigente da Reserved y es repetible por la misma cuenta`() =
        runTest {
            val store = storeOn()
            store.filled()

            assertEquals(ReserveResult.Reserved, store.reserve("a", fingerprint))
            assertEquals(ReserveResult.Reserved, store.reserve("a", fingerprint))
            assertEquals(CartReservation("a", fingerprint), storedReservation())
        }

    @Test
    fun `reserve con la bolsa reservada por otra cuenta da Foreign y no toca nada`() =
        runTest {
            val store = storeOn()
            store.filled()
            store.reserve("a", fingerprint)

            assertEquals(ReserveResult.Foreign, store.reserve("b", fingerprint))

            assertEquals(CartReservation("a", fingerprint), storedReservation())
            assertEquals(1, checkNotNull(store.cart.first()).count)
        }

    @Test
    fun `la reserva queda en el archivo y otra instancia que parte de ese archivo la respeta`() =
        runTest {
            val first = storeOn()
            first.filled()
            first.reserve("a", fingerprint)
            assertTrue(file().readText().contains("\"reservation\""))
            val saved = checkNotNull(storedSnapshot())

            // Una copia del archivo escrito: así hay un solo DataStore vivo por archivo.
            val copy = File(folder.root, "copia_de_la_bolsa.json")
            copy.outputStream().use { CartSerializer.writeTo(saved, it) }
            val reopened = storeOn(copy)

            assertEquals(ReserveResult.Foreign, reopened.reserve("b", fingerprint))
            assertEquals(ReserveResult.Reserved, reopened.reserve("a", fingerprint))
        }

    @Test
    fun `una bolsa guardada antes sin el campo reservation se lee igual y se puede reservar`() =
        runTest {
            file().writeText(
                "{\"version\":1,\"businessId\":\"n\",\"businessName\":\"Pollería\",\"lines\":[{\"itemId\":\"plato\"," +
                    "\"name\":\"Lomo\",\"basePrice\":\"12.50\",\"modifiers\":[],\"note\":null,\"quantity\":1," +
                    "\"imageUrl\":null}]}",
            )
            val store = storeOn()

            assertEquals(1, checkNotNull(store.cart.first()).count)
            assertEquals(ReserveResult.Reserved, store.reserve("a", fingerprint))
            assertEquals(CartReservation("a", fingerprint), storedReservation())
        }

    @Test
    fun `editar la bolsa conserva la reserva, pero solo vale para la huella que se reservo`() =
        runTest {
            val store = storeOn()
            store.filled()
            store.reserve("a", fingerprint)
            val signature = checkNotNull(store.cart.first()).lines.single().signature

            store.setQuantity(signature, 2)
            assertEquals(CartReservation("a", fingerprint), storedReservation())
            // La versión nueva no es ajena: B la puede reservar y no se le descarta.
            assertFalse(store.discardForeign("b"))
            assertEquals(ReserveResult.Reserved, store.reserve("b", cartOf(quantity = 2).fingerprint()))
            assertEquals(CartReservation("b", cartOf(quantity = 2).fingerprint()), storedReservation())
        }

    @Test
    fun `editar y deshacer la edicion deja la bolsa de nuevo ajena`() =
        runTest {
            val store = storeOn()
            store.filled()
            store.reserve("a", fingerprint)
            val signature = checkNotNull(store.cart.first()).lines.single().signature

            store.setQuantity(signature, 2)
            store.setQuantity(signature, 1)

            assertEquals(ReserveResult.Foreign, store.reserve("b", fingerprint))
            assertTrue(store.discardForeign("b"))
            assertNull(store.cart.first())
        }

    @Test
    fun `agregar y quitar un plato conservan la reserva y deshacerlo vuelve a ser ajena`() =
        runTest {
            val store = storeOn()
            store.filled()
            store.reserve("a", fingerprint)

            store.add("n", "Pollería", line(itemId = "otro"))
            assertEquals(CartReservation("a", fingerprint), storedReservation())
            val other = checkNotNull(store.cart.first()).lines.first { it.itemId == "otro" }
            store.remove(other.signature)

            assertEquals(ReserveResult.Foreign, store.reserve("b", fingerprint))
        }

    @Test
    fun `replace pierde la reserva porque es otra bolsa`() =
        runTest {
            val store = storeOn()
            store.filled()
            store.reserve("a", fingerprint)

            store.replace("n", "Pollería", line())

            assertNull(storedReservation())
            assertEquals(ReserveResult.Reserved, store.reserve("b", fingerprint))
        }

    @Test
    fun `clear pierde la reserva`() =
        runTest {
            val store = storeOn()
            store.filled()
            store.reserve("a", fingerprint)

            store.clear()
            store.filled()

            assertNull(storedReservation())
        }

    @Test
    fun `consume vacia solo con la huella vigente y la reserva de esa cuenta`() =
        runTest {
            val store = storeOn()
            store.filled()
            store.reserve("a", fingerprint)

            store.consume("a", cartOf(quantity = 2).fingerprint())
            assertEquals(1, checkNotNull(store.cart.first()).count)
            assertEquals(CartReservation("a", fingerprint), storedReservation())

            store.consume("a", fingerprint)
            assertNull(store.cart.first())
        }

    @Test
    fun `consume con otra cuenta o sin reserva no vacia`() =
        runTest {
            val store = storeOn()
            store.filled()

            store.consume("a", fingerprint) // sin reserva
            assertEquals(1, checkNotNull(store.cart.first()).count)

            store.reserve("a", fingerprint)
            store.consume("b", fingerprint) // reservada por otra cuenta
            assertEquals(1, checkNotNull(store.cart.first()).count)
            assertEquals(CartReservation("a", fingerprint), storedReservation())
        }

    @Test
    fun `consume sin bolsa no hace nada`() =
        runTest {
            val store = storeOn()

            store.consume("a", fingerprint)

            assertNull(store.cart.first())
        }

    @Test
    fun `discardForeign no toca la bolsa de su dueno ni la que nadie reservo`() =
        runTest {
            val store = storeOn()
            store.filled()
            assertFalse(store.discardForeign("a"))

            store.reserve("a", fingerprint)
            assertFalse(store.discardForeign("a"))

            assertEquals(1, checkNotNull(store.cart.first()).count)
            assertEquals(CartReservation("a", fingerprint), storedReservation())
        }

    @Test
    fun `discardForeign vacia la bolsa reservada por otra cuenta`() =
        runTest {
            val store = storeOn()
            store.filled()
            store.reserve("a", fingerprint)

            assertTrue(store.discardForeign("b"))

            assertNull(store.cart.first())
        }
}
