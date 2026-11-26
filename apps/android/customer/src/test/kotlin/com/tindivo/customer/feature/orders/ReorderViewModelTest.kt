package com.tindivo.customer.feature.orders

import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.customer.feature.cart.Cart
import com.tindivo.customer.feature.cart.CartLine
import com.tindivo.customer.feature.cart.CartModifier
import com.tindivo.customer.feature.cart.CartSerializer
import com.tindivo.customer.feature.cart.CartSnapshot
import com.tindivo.customer.feature.cart.CartStore
import com.tindivo.customer.support.testDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.math.BigDecimal
import java.util.UUID

/** CUS-CRT-012: «Volver a pedir» repone la bolsa con lo que revalidó el servidor (`GET /customer/orders/{id}/reorder`). */
@OptIn(ExperimentalCoroutinesApi::class)
class ReorderViewModelTest : OrdersHarness() {
    @get:Rule
    val folder = TemporaryFolder()

    private val orderId = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01")
    private val dish = "7b2a737a-018f-4c2d-9a11-6f0d3c1e8a11"
    private val dish2 = "7b2a737a-018f-4c2d-9a11-6f0d3c1e8a12"
    private val option = "8b2a737a-018f-4c2d-9a11-6f0d3c1e8a21"

    private fun cartStore() =
        CartStore(
            testDataStore(
                serializer = CartSerializer,
                corruptionHandler = ReplaceFileCorruptionHandler<CartSnapshot?>(produceNewData = { null }),
                scope = CoroutineScope(dispatcher),
                produceFile = { File(folder.root, "tindivo_cart.json") },
            ),
        )

    private fun reorderViewModel(cart: CartStore) = ReorderViewModel(repository(), store, cart)

    private fun body(
        items: String,
        changes: String = "",
    ) = """{"data":{"orderId":"$orderId","businessId":"$BUSINESS_ID","businessName":"Pollería Rosa",
        "items":[$items],"changes":[$changes]}}"""

    private val pollo =
        """{"menuItemId":"$dish","name":"Pollo","quantity":2,"note":"sin ají","basePrice":"20.00",
        "modifiers":[{"id":"$option","groupName":"Tamaño","optionName":"1/4","price":"2.50"}],
        "unitPrice":"22.50","imageUrl":"https://img.test/p.webp","thumbnailUrl":null}"""
    private val gaseosa =
        """{"menuItemId":"$dish2","name":"Gaseosa","quantity":1,"note":null,"basePrice":"5.00",
        "modifiers":[],"unitPrice":"5.00","imageUrl":null,"thumbnailUrl":null}"""

    private fun otherBusinessLine() = CartLine("x", "Ceviche", BigDecimal("18.00"), emptyList(), null, 1, null)

    @Test
    fun `con la bolsa vacia deja la bolsa del pedido con precios, opciones, nota y foto, y pide ir a ella`() =
        runTest {
            server.enqueue(response(200, body("$pollo,$gaseosa")))
            val cart = cartStore()
            val viewModel = reorderViewModel(cart)

            viewModel.reorder(orderId)

            assertEquals(ReorderOutcome.Ready(emptyList()), viewModel.outcome.value)
            val saved = cart.cart.first() as Cart
            assertEquals(BUSINESS_ID.toString(), saved.businessId)
            assertEquals("Pollería Rosa", saved.businessName)
            assertEquals(2, saved.lines.size)
            val first = saved.lines.first { it.itemId == dish }
            assertEquals(2, first.quantity)
            assertEquals("sin ají", first.note)
            assertEquals(BigDecimal("20.00"), first.basePrice)
            assertEquals(CartModifier(option, "Tamaño", "1/4", BigDecimal("2.50")), first.modifiers.single())
            assertEquals("https://img.test/p.webp", first.imageUrl)
            assertEquals("/api/v1/customer/orders/$orderId/reorder", server.takeRequest().url.encodedPath)
        }

    @Test
    fun `lo que cambio llega con la bolsa repuesta para que la persona lo vea`() =
        runTest {
            val changes =
                """{"kind":"item_unavailable","itemName":"Chicha","menuItemId":"$dish2","before":null,"after":null},
                {"kind":"price_changed","itemName":"Pollo","menuItemId":"$dish","before":"20.00","after":"22.50"}"""
            server.enqueue(response(200, body(pollo, changes)))
            val viewModel = reorderViewModel(cartStore())

            viewModel.reorder(orderId)

            val ready = viewModel.outcome.value as ReorderOutcome.Ready
            assertEquals(
                listOf(
                    ReorderChangeUi(ReorderChangeKind.Unavailable, "Chicha", null, null),
                    ReorderChangeUi(ReorderChangeKind.PriceChanged, "Pollo", "20.00", "22.50"),
                ),
                ready.changes,
            )
        }

    @Test
    fun `si ningun plato se puede repetir no toca la bolsa y lo dice`() =
        runTest {
            val gone = """{"kind":"item_removed","itemName":"Pollo","menuItemId":null,"before":null,"after":null}"""
            server.enqueue(response(200, body("", gone)))
            val cart = cartStore()
            cart.add("otro", "Cevichería", otherBusinessLine())
            val viewModel = reorderViewModel(cart)

            viewModel.reorder(orderId)

            assertTrue(viewModel.outcome.value is ReorderOutcome.NothingAvailable)
            assertEquals("otro", cart.cart.first()?.businessId)
        }

    @Test
    fun `con la bolsa de otro negocio pide confirmar y no la toca hasta que la persona acepte`() =
        runTest {
            server.enqueue(response(200, body(pollo)))
            val cart = cartStore()
            cart.add("otro", "Cevichería", otherBusinessLine())
            val viewModel = reorderViewModel(cart)

            viewModel.reorder(orderId)

            assertEquals(ReorderOutcome.OtherBusiness("Cevichería", "Pollería Rosa"), viewModel.outcome.value)
            assertEquals("otro", cart.cart.first()?.businessId)

            viewModel.replaceWithPending()

            assertEquals(ReorderOutcome.Ready(emptyList()), viewModel.outcome.value)
            val saved = cart.cart.first() as Cart
            assertEquals(BUSINESS_ID.toString(), saved.businessId)
            assertEquals(listOf(dish), saved.lines.map { it.itemId })
        }

    @Test
    fun `si la persona mantiene su bolsa no se repone nada`() =
        runTest {
            server.enqueue(response(200, body(pollo)))
            val cart = cartStore()
            cart.add("otro", "Cevichería", otherBusinessLine())
            val viewModel = reorderViewModel(cart)
            viewModel.reorder(orderId)

            viewModel.consumeOutcome()
            viewModel.replaceWithPending()

            assertNull(viewModel.outcome.value)
            assertEquals("otro", cart.cart.first()?.businessId)
        }

    @Test
    fun `con la bolsa del mismo negocio suma los platos sin vaciarla`() =
        runTest {
            server.enqueue(response(200, body(pollo)))
            val cart = cartStore()
            cart.add(BUSINESS_ID.toString(), "Pollería Rosa", otherBusinessLine())
            val viewModel = reorderViewModel(cart)

            viewModel.reorder(orderId)

            assertEquals(ReorderOutcome.Ready(emptyList()), viewModel.outcome.value)
            assertEquals(2, (cart.cart.first() as Cart).lines.size)
        }

    @Test
    fun `un fallo del servidor no toca la bolsa y deja reintentar`() =
        runTest {
            server.enqueue(response(404, NOT_FOUND_BODY))
            val cart = cartStore()
            val viewModel = reorderViewModel(cart)

            viewModel.reorder(orderId)

            assertTrue(viewModel.outcome.value is ReorderOutcome.Failed)
            assertNull(cart.cart.first())

            server.enqueue(response(200, body(pollo)))
            viewModel.consumeOutcome()
            viewModel.reorder(orderId)
            assertNotNull(cart.cart.first())
        }

    @Test
    fun `un precio ilegible falla cerrado y no escribe la bolsa`() =
        runTest {
            server.enqueue(response(200, body(pollo.replace("\"20.00\"", "\"veinte\""))))
            val cart = cartStore()
            val viewModel = reorderViewModel(cart)

            viewModel.reorder(orderId)

            assertTrue(viewModel.outcome.value is ReorderOutcome.Failed)
            assertNull(cart.cart.first())
        }

    private companion object {
        const val NOT_FOUND_BODY =
            """{"type":"about:blank","title":"Not Found","status":404,"detail":"order_not_found","code":"not_found"}"""
    }
}
