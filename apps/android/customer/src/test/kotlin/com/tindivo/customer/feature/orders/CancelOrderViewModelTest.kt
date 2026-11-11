package com.tindivo.customer.feature.orders

import androidx.lifecycle.SavedStateHandle
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.util.UUID

/** Cancelar desde el detalle: confirmar, una sola petición, los errores de la API y la sesión atada a la cuenta. */
@OptIn(ExperimentalCoroutinesApi::class)
class CancelOrderViewModelTest {
    private val dispatcher = UnconfinedTestDispatcher()
    private lateinit var configService: ConfigService

    /** Cada petición queda anotada y no responde hasta que la prueba completa su resultado. */
    private class FakeCanceller : OrderCanceller {
        val calls = mutableListOf<Pair<String, UUID>>()
        val replies = mutableListOf<CompletableDeferred<ApiResult<Unit>>>()

        override suspend fun cancel(
            accountId: String,
            orderId: UUID,
        ): ApiResult<Unit> {
            calls += accountId to orderId
            val reply = CompletableDeferred<ApiResult<Unit>>()
            replies += reply
            return reply.await()
        }

        fun answer(result: ApiResult<Unit>) = replies.last().complete(result)
    }

    private val canceller = FakeCanceller()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        // El ViewModel solo le avisa un 426; nunca lee `/config`, así que el servidor no hace falta.
        val client =
            createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = RetryInterceptor(sleeper = { _, _ -> }))
        configService =
            ConfigService(
                SystemRepository("http://127.0.0.1:9/api/v1", client, dispatcher),
                "0.1.0",
                CoroutineScope(dispatcher),
            )
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel(store: FakeSessionStore) =
        CancelOrderViewModel(SavedStateHandle(mapOf("id" to ORDER_ID.toString())), canceller, store, configService)

    private fun known(
        status: Int,
        code: ApiErrorCode,
        detail: String? = null,
    ) = ApiResult.Failure(AppError.Known(code = code, status = status, detail = detail))

    @Test
    fun `confirmar cancela con la cuenta de la sesion y pide recargar el pedido`() =
        runTest {
            val viewModel = viewModel(FakeSessionStore())

            viewModel.askToConfirm()
            assertTrue(viewModel.state.value.confirming)
            viewModel.confirm()
            assertTrue(viewModel.state.value.cancelling)
            canceller.answer(ApiResult.Success(Unit))

            assertEquals(listOf("user-1" to ORDER_ID), canceller.calls)
            assertEquals(CancelUiState(refreshRequests = 1, settled = true), viewModel.state.value)
        }

    @Test
    fun `un doble toque en confirmar manda una sola peticion`() =
        runTest {
            val viewModel = viewModel(FakeSessionStore())

            viewModel.askToConfirm()
            viewModel.confirm()
            viewModel.confirm()
            viewModel.dismiss()
            canceller.answer(ApiResult.Success(Unit))
            viewModel.confirm()

            assertEquals(1, canceller.calls.size)
        }

    @Test
    fun `sin abrir la confirmacion no se cancela nada`() =
        runTest {
            val viewModel = viewModel(FakeSessionStore())

            viewModel.confirm()
            viewModel.askToConfirm()
            viewModel.dismiss()
            viewModel.confirm()

            assertTrue(canceller.calls.isEmpty())
            assertFalse(viewModel.state.value.confirming)
        }

    @Test
    fun `un 409 dice el motivo del servidor y recarga el pedido`() =
        runTest {
            val viewModel = viewModel(FakeSessionStore())
            val motivo = "Tu pedido ya fue aceptado por el restaurante y no puede cancelarse"

            viewModel.askToConfirm()
            viewModel.confirm()
            canceller.answer(known(409, ApiErrorCode.OrderNotCancellable, motivo))

            assertEquals(
                CancelUiState(problem = CancelProblem.NotCancellable(motivo), refreshRequests = 1, settled = true),
                viewModel.state.value,
            )
        }

    @Test
    fun `un 422 o un 404 cuentan como ya no cancelable sin mostrar un detalle ajeno`() {
        assertEquals(
            CancelProblem.NotCancellable(null),
            problemOf(AppError.Known(ApiErrorCode.InvalidStateTransition, 422, "invalid transition")),
        )
        assertEquals(CancelProblem.NotCancellable(null), problemOf(AppError.Known(ApiErrorCode.NotFound, 404, "x")))
        assertEquals(CancelProblem.Generic, problemOf(AppError.Known(ApiErrorCode.InternalError, 500, "boom")))
        assertEquals(CancelProblem.Generic, problemOf(AppError.Unknown(code = null, detail = null)))
    }

    @Test
    fun `sin conexion avisa y vuelve a consultar por si la cancelacion llego`() =
        runTest {
            val viewModel = viewModel(FakeSessionStore())

            viewModel.askToConfirm()
            viewModel.confirm()
            canceller.answer(ApiResult.Failure(AppError.Network(IOException("sin red"))))

            assertEquals(CancelUiState(problem = CancelProblem.Offline, refreshRequests = 1), viewModel.state.value)
            // Se puede volver a intentar: abrir otra vez borra el aviso.
            viewModel.askToConfirm()
            assertEquals(null, viewModel.state.value.problem)
        }

    @Test
    fun `un 401 cierra la sesion y no deja cancelar mas`() =
        runTest {
            val store = FakeSessionStore()
            val viewModel = viewModel(store)

            viewModel.askToConfirm()
            viewModel.confirm()
            canceller.answer(known(401, ApiErrorCode.Unauthorized))
            viewModel.askToConfirm()
            viewModel.confirm()

            assertEquals(1, store.signOutCalls)
            assertEquals(CancelUiState(), viewModel.state.value)
            assertEquals(1, canceller.calls.size)
        }

    @Test
    fun `un 426 avisa al ConfigService`() =
        runTest {
            val viewModel = viewModel(FakeSessionStore())

            viewModel.askToConfirm()
            viewModel.confirm()
            canceller.answer(ApiResult.Failure(AppError.UpgradeRequired("1.2.0")))

            assertEquals(ConfigState.UpgradeRequired("1.2.0"), configService.state.value)
            assertFalse(viewModel.state.value.cancelling)
        }

    @Test
    fun `cambiar de cuenta A a B con la cancelacion en vuelo no aplica nada de A en B`() =
        runTest {
            val store = FakeSessionStore(SessionState.SignedIn("user-a"))
            val viewModel = viewModel(store)

            viewModel.askToConfirm()
            viewModel.confirm()
            store.switchTo("user-b")
            canceller.answer(ApiResult.Success(Unit))

            // Ni el diálogo de A, ni su recarga, ni un aviso: la pantalla de B empieza de cero y no cancela nada.
            assertEquals(CancelUiState(), viewModel.state.value)
            viewModel.askToConfirm()
            viewModel.confirm()
            assertEquals(listOf("user-a" to ORDER_ID), canceller.calls)
        }

    @Test
    fun `un 401 de A que llega ya con B en la sesion no cierra la sesion de B`() =
        runTest {
            val store = FakeSessionStore(SessionState.SignedIn("user-a"))
            val viewModel = viewModel(store)

            viewModel.askToConfirm()
            viewModel.confirm()
            store.switchTo("user-b")
            canceller.answer(known(401, ApiErrorCode.Unauthorized))

            assertEquals(0, store.signOutCalls)
            assertEquals(SessionState.SignedIn("user-b"), store.state.value)
        }

    @Test
    fun `tras cancelar, con el detalle de antes a la vista, no se vuelve a ofrecer ni sale otro POST`() =
        runTest {
            val viewModel = viewModel(FakeSessionStore())

            viewModel.askToConfirm()
            viewModel.confirm()
            canceller.answer(ApiResult.Success(Unit))
            // La recarga del detalle no llegó (o falló): la fila de cancelar sigue a la vista. Se vuelve a tocar.
            viewModel.askToConfirm()
            viewModel.confirm()

            assertEquals(1, canceller.calls.size)
            assertFalse(viewModel.state.value.confirming)
            assertTrue(viewModel.state.value.settled)
        }

    @Test
    fun `tras un ya no se puede, con el detalle de antes a la vista, no sale otro POST`() =
        runTest {
            val viewModel = viewModel(FakeSessionStore())

            viewModel.askToConfirm()
            viewModel.confirm()
            canceller.answer(known(409, ApiErrorCode.OrderNotCancellable, "Ya fue aceptado"))
            viewModel.askToConfirm()
            viewModel.confirm()

            assertEquals(1, canceller.calls.size)
            assertFalse(viewModel.state.value.confirming)
        }

    @Test
    fun `sin conexion o con un error generico se puede volver a intentar y decide el servidor`() =
        runTest {
            val viewModel = viewModel(FakeSessionStore())

            viewModel.askToConfirm()
            viewModel.confirm()
            canceller.answer(ApiResult.Failure(AppError.Network(IOException("sin red"))))
            viewModel.askToConfirm()
            viewModel.confirm()
            canceller.answer(known(500, ApiErrorCode.InternalError))
            viewModel.askToConfirm()
            viewModel.confirm()

            assertEquals(3, canceller.calls.size)
            assertFalse(viewModel.state.value.settled)
        }

    @Test
    fun `sin sesion no se cancela nada`() =
        runTest {
            val viewModel = viewModel(FakeSessionStore(SessionState.SignedOut))

            viewModel.askToConfirm()
            viewModel.confirm()

            assertTrue(canceller.calls.isEmpty())
        }
}
