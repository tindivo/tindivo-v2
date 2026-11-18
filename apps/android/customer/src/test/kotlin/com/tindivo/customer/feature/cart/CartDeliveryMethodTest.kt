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
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.math.BigDecimal

/** CUS-CRT-007: la bolsa recuerda si es de delivery o de recojo; se elige en el checkout. */
@OptIn(ExperimentalCoroutinesApi::class)
class CartDeliveryMethodTest {
    @get:Rule
    val folder = TemporaryFolder()

    private fun file() = File(folder.root, "tindivo_cart.json")

    private fun TestScope.store() =
        CartStore(
            DataStoreFactory.create(
                serializer = CartSerializer,
                corruptionHandler = ReplaceFileCorruptionHandler<CartSnapshot?>(produceNewData = { null }),
                scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler)),
                produceFile = { file() },
            ),
        )

    private fun line(itemId: String = "plato") =
        CartLine(itemId, "Lomo", BigDecimal("12.50"), emptyList(), null, 1, null)

    private fun snapshot(method: String? = null): CartSnapshot {
        val base = checkNotNull(Cart("n", "Pollería", listOf(line())).toSnapshot())
        return if (method == null) base else base.copy(deliveryMethod = method)
    }

    @Test
    fun `CA-CRT-04 · una bolsa nueva es de delivery`() {
        assertEquals(DeliveryMethod.Delivery, Cart("n", "Pollería", listOf(line())).deliveryMethod)
        val added = addToCart(null, "n", "Pollería", line()) as AddResult.Added
        assertEquals(DeliveryMethod.Delivery, added.cart.deliveryMethod)
    }

    @Test
    fun `CA-CRT-04 · el metodo de entrega se guarda y se recupera del disco`() =
        runTest {
            val store = store()
            store.add("n", "Pollería", line())
            store.setDeliveryMethod(DeliveryMethod.Pickup)

            // Otro DataStore sobre el mismo archivo: lo que había en memoria no cuenta.
            assertEquals(DeliveryMethod.Pickup, checkNotNull(store().cart.first()).deliveryMethod)
        }

    @Test
    fun `CA-CRT-04 · agregar mas platos o cambiar cantidades no cambia el metodo`() =
        runTest {
            val store = store()
            store.add("n", "Pollería", line())
            store.setDeliveryMethod(DeliveryMethod.Pickup)
            store.add("n", "Pollería", line("otro"))
            store.setQuantity(line().signature, 3)

            assertEquals(DeliveryMethod.Pickup, checkNotNull(store.cart.first()).deliveryMethod)
        }

    @Test
    fun `CA-CRT-01 · al reemplazar por otro negocio el metodo vuelve a delivery`() =
        runTest {
            val store = store()
            store.add("n", "Pollería", line())
            store.setDeliveryMethod(DeliveryMethod.Pickup)
            store.replace("otro", "Chifa", line("fideos"))

            assertEquals(DeliveryMethod.Delivery, checkNotNull(store.cart.first()).deliveryMethod)
        }

    @Test
    fun `CA-CRT-03 · al vaciarse la bolsa tambien se olvida el metodo`() =
        runTest {
            val store = store()
            store.add("n", "Pollería", line())
            store.setDeliveryMethod(DeliveryMethod.Pickup)
            store.remove(line().signature)
            assertNull(store.cart.first())

            store.add("n", "Pollería", line())
            assertEquals(DeliveryMethod.Delivery, checkNotNull(store.cart.first()).deliveryMethod)
        }

    @Test
    fun `sin bolsa elegir un metodo no inventa una`() =
        runTest {
            val store = store()
            store.setDeliveryMethod(DeliveryMethod.Pickup)
            assertNull(store.cart.first())
        }

    @Test
    fun `CA-CRT-04 · una bolsa guardada antes del metodo (version 1) se lee como delivery`() {
        val old = snapshot().copy(version = 1)
        assertEquals(DeliveryMethod.Delivery, checkNotNull(old.toCartOrNull()).deliveryMethod)
    }

    @Test
    fun `un metodo desconocido en el disco cae a delivery`() {
        assertEquals(DeliveryMethod.Delivery, checkNotNull(snapshot("moto").toCartOrNull()).deliveryMethod)
        assertEquals(DeliveryMethod.Pickup, checkNotNull(snapshot("pickup").toCartOrNull()).deliveryMethod)
    }

    @Test
    fun `el formato nuevo escribe la version 2 y el metodo`() {
        val written = checkNotNull(Cart("n", "Pollería", listOf(line()), DeliveryMethod.Pickup).toSnapshot())
        assertEquals(2, CART_SNAPSHOT_VERSION)
        assertEquals(CART_SNAPSHOT_VERSION, written.version)
        assertEquals("pickup", written.deliveryMethod)
    }
}
