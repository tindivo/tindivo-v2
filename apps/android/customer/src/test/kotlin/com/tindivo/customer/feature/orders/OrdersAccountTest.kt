package com.tindivo.customer.feature.orders

import com.tindivo.customer.feature.checkout.sessionJwt
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.MainCoroutineDispatcher
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.concurrent.thread
import kotlin.coroutines.CoroutineContext

/** El historial es de la cuenta que abrió la pantalla: cada página sale solo con su token. */
@OptIn(ExperimentalCoroutinesApi::class)
class OrdersAccountTest : OrdersHarness() {
    @Test
    fun `cada pagina sale con el token de la cuenta que abrio la pantalla`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = "c2")))
            server.enqueue(response(200, pageJson(ids(2), next = null)))
            val viewModel = viewModel()
            viewModel.settled()

            viewModel.loadMore()

            assertEquals(2, (viewModel.state.value as OrdersUiState.Loaded).items.size)
            assertEquals("Bearer ${sessionJwt("user-1")}", server.takeRequest().headers["Authorization"])
            assertEquals("Bearer ${sessionJwt("user-1")}", server.takeRequest().headers["Authorization"])
        }

    @Test
    fun `si el token ya es de otra cuenta no se pide nada, no se cierra esa sesion y no se ven pedidos`() =
        runTest {
            tokens.token = sessionJwt("user-2")

            val state = viewModel().settled()

            assertEquals(OrdersUiState.LoggedOut, state)
            assertEquals(0, server.requestCount)
            assertTrue(store.signOutIfCalls.isEmpty())
            assertEquals(0, store.signOutCalls)
        }

    @Test
    fun `si el token cambia de cuenta antes de pedir mas se tira lo cargado sin pedir nada`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = "c2")))
            val viewModel = viewModel()
            viewModel.settled()

            tokens.token = sessionJwt("user-2")
            viewModel.loadMore()

            assertEquals(OrdersUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, server.requestCount)
            assertTrue(store.signOutIfCalls.isEmpty())
        }

    @Test
    fun `la cuenta se fija al abrir, antes de que la carga arranque`() =
        runTest {
            // Main encola: la carga queda lanzada pero aún no corre, y la sesión cambia de cuenta justo en ese hueco.
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            server.enqueue(response(200, pageJson(ids(1), next = null)))
            val viewModel = viewModel()

            store.switchTo("user-2")
            tokens.token = sessionJwt("user-2")
            runCurrent()

            assertEquals(OrdersUiState.LoggedOut, viewModel.state.value)
            assertEquals(0, server.requestCount)
            assertEquals(0, store.signOutCalls)
            assertEquals(SessionState.SignedIn("user-2"), store.state.value)
        }

    @Test
    fun `si entra otra cuenta y se pide mas antes de que la vigilancia lo vea, nada sale con la cuenta nueva`() =
        runTest {
            // Como en el teléfono: el toque corre en el hilo principal y su carga arranca en el acto (`Main.immediate`);
            // el aviso del almacén llega de otro hilo y espera su turno en la cola, detrás del toque.
            Dispatchers.setMain(LooperMain(StandardTestDispatcher(testScheduler), Thread.currentThread()))
            server.enqueue(response(200, pageJson(ids(1), next = "c2")))
            server.enqueue(response(200, pageJson(ids(2), next = null)))
            val viewModel = viewModel()
            assertTrue(viewModel.state.value is OrdersUiState.Loaded)

            thread { store.switchTo("user-2") }.join()
            tokens.token = sessionJwt("user-2")
            viewModel.loadMore()

            // La carga sale atada a user-1, la cuenta que abrió la pantalla: con el token de user-2 no se envía y la
            // pantalla se cierra antes de que la vigilancia vea el cambio.
            assertEquals(OrdersUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, server.requestCount)
            runCurrent()
            assertEquals(OrdersUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, server.requestCount)
            assertTrue(store.signOutIfCalls.isEmpty())
            assertEquals(SessionState.SignedIn("user-2"), store.state.value)
        }

    @Test
    fun `sin sesion al abrir la pantalla queda fuera en el acto y no pide nada`() =
        runTest {
            // Main encola: quien vigila la sesión aún no corre, y la pantalla no espera a que él lo vea.
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            store.switchToSignedOut()

            val viewModel = viewModel()

            assertEquals(OrdersUiState.LoggedOut, viewModel.state.value)
            runCurrent()
            assertEquals(OrdersUiState.LoggedOut, viewModel.state.value)
            assertEquals(0, server.requestCount)
            assertEquals(0, store.signOutCalls)
        }
}

/**
 * El hilo principal de Android en una prueba: lo lanzado con `Main.immediate` desde [mainThread] corre en el acto, y lo
 * que se reanuda desde otro hilo espera su turno en [queue].
 */
private class LooperMain(
    private val queue: CoroutineDispatcher,
    private val mainThread: Thread,
) : MainCoroutineDispatcher() {
    override val immediate: MainCoroutineDispatcher =
        object : MainCoroutineDispatcher() {
            override val immediate: MainCoroutineDispatcher get() = this

            override fun isDispatchNeeded(context: CoroutineContext): Boolean = Thread.currentThread() !== mainThread

            override fun dispatch(
                context: CoroutineContext,
                block: Runnable,
            ) = queue.dispatch(context, block)
        }

    override fun dispatch(
        context: CoroutineContext,
        block: Runnable,
    ) = queue.dispatch(context, block)
}
