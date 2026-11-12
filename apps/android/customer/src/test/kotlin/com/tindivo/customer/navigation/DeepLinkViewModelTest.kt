package com.tindivo.customer.navigation

import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/** Un aviso tocado abre su pantalla: el pedido se busca en la cuenta vigente; sin sesión, el inicio. */
@OptIn(ExperimentalCoroutinesApi::class)
class DeepLinkViewModelTest {
    private val inbox = DeepLinkInbox()
    private val session = FakeSessionStore(SessionState.SignedIn("A"))
    private val lookups = mutableListOf<Pair<String, String>>()
    private val courierLookups = mutableListOf<Pair<String, String>>()
    private var found: String? = ORDER_ID
    private var foundCourier: String? = COURIER_ID

    private val lookup =
        OrderLookup { shortId, account ->
            lookups += shortId to account
            found
        }

    private val courierLookup =
        CourierLookup { shortId, account ->
            courierLookups += shortId to account
            foundCourier
        }

    private fun viewModel(
        sessionStore: FakeSessionStore = session,
        orders: OrderLookup = lookup,
    ) = DeepLinkViewModel(inbox, sessionStore, orders, courierLookup)

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `un aviso de un pedido abre su detalle, buscado con la cuenta vigente`() =
        runTest {
            val viewModel = viewModel()

            inbox.offer(DeepLinkTarget.Order("AB2C3D4E"))

            assertEquals(DeepLinkNavigation.OrderDetail(ORDER_ID), viewModel.navigation.value)
            assertEquals(listOf("AB2C3D4E" to "A"), lookups)
            assertNull("atendido: no se repite", inbox.pending.value)
        }

    @Test
    fun `CAX-004 un aviso de una entrega abre su seguimiento, buscado con la cuenta vigente`() =
        runTest {
            val viewModel = viewModel()

            inbox.offer(DeepLinkTarget.Courier("AB2C3D4E"))

            assertEquals(DeepLinkNavigation.CourierDetail(COURIER_ID, "AB2C3D4E", "A"), viewModel.navigation.value)
            assertEquals(listOf("AB2C3D4E" to "A"), courierLookups)
            assertEquals(emptyList<Pair<String, String>>(), lookups)
            assertNull("atendido: no se repite", inbox.pending.value)
        }

    @Test
    fun `una entrega que no aparece abre Mis entregas`() =
        runTest {
            foundCourier = null
            val viewModel = viewModel()

            inbox.offer(DeepLinkTarget.Courier("AB2C3D4E"))

            assertEquals(DeepLinkNavigation.CourierList, viewModel.navigation.value)
        }

    @Test
    fun `sin sesion una entrega abre el inicio y no se busca nada`() =
        runTest {
            session.switchToSignedOut()
            val viewModel = viewModel()

            inbox.offer(DeepLinkTarget.Courier("AB2C3D4E"))

            assertEquals(DeepLinkNavigation.Home, viewModel.navigation.value)
            assertEquals(emptyList<Pair<String, String>>(), courierLookups)
        }

    @Test
    fun `si la cuenta cambia mientras se busca la entrega, no se abre la de la anterior`() =
        runTest {
            val switching =
                CourierLookup { _, _ ->
                    session.switchTo("B")
                    COURIER_ID
                }
            val viewModel = DeepLinkViewModel(inbox, session, lookup, switching)

            inbox.offer(DeepLinkTarget.Courier("AB2C3D4E"))

            assertEquals(DeepLinkNavigation.Home, viewModel.navigation.value)
        }

    @Test
    fun `un pedido que no aparece abre Mis pedidos`() =
        runTest {
            found = null
            val viewModel = viewModel()

            inbox.offer(DeepLinkTarget.Order("AB2C3D4E"))

            assertEquals(DeepLinkNavigation.Orders, viewModel.navigation.value)
        }

    @Test
    fun `sin sesion un pedido o la cuenta abren el inicio y no se busca nada`() =
        runTest {
            session.switchToSignedOut()
            val viewModel = viewModel()

            inbox.offer(DeepLinkTarget.Order("AB2C3D4E"))
            assertEquals(DeepLinkNavigation.Home, viewModel.navigation.value)
            viewModel.navigated()
            inbox.offer(DeepLinkTarget.Account)

            assertEquals(DeepLinkNavigation.Home, viewModel.navigation.value)
            assertEquals(emptyList<Pair<String, String>>(), lookups)
        }

    @Test
    fun `si la cuenta cambia mientras se busca, no se abre el pedido de la anterior`() =
        runTest {
            val switching =
                OrderLookup { _, _ ->
                    session.switchTo("B")
                    ORDER_ID
                }
            val viewModel = viewModel(orders = switching)

            inbox.offer(DeepLinkTarget.Order("AB2C3D4E"))

            assertEquals(DeepLinkNavigation.Home, viewModel.navigation.value)
        }

    @Test
    fun `la cuenta y el inicio se abren tal cual, y navegado se limpia`() =
        runTest {
            val viewModel = viewModel()

            inbox.offer(DeepLinkTarget.Account)
            assertEquals(DeepLinkNavigation.Account, viewModel.navigation.value)
            viewModel.navigated()
            assertNull(viewModel.navigation.value)
            inbox.offer(DeepLinkTarget.Home)

            assertEquals(DeepLinkNavigation.Home, viewModel.navigation.value)
        }

    @Test
    fun `al arrancar desde un aviso espera a saber si hay sesion`() =
        runTest {
            val unknown = FakeSessionStore(SessionState.Unknown)
            val viewModel = viewModel(sessionStore = unknown)

            inbox.offer(DeepLinkTarget.Account)
            assertNull(viewModel.navigation.value)
            unknown.switchTo("A")

            assertEquals(DeepLinkNavigation.Account, viewModel.navigation.value)
        }

    private companion object {
        const val ORDER_ID = "8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
        const val COURIER_ID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
    }
}
