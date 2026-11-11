package com.tindivo.customer.feature.courier

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CourierHomeViewModelTest : CourierHarness() {
    private fun viewModel() = CourierHomeViewModel(gateway, session, config)

    private fun page(
        vararg items: CourierCardUi,
        next: String? = null,
    ): ApiResult<CourierPageUi> = ApiResult.Success(CourierPageUi(items.toList(), next, emptyList()))

    private fun pageCalls() = gateway.calls.filter { it.startsWith("page:") }

    @Test
    fun `sin sesion muestra el estado del servicio y no pide la lista`() =
        runTest {
            session.switchToSignedOut()
            val viewModel = viewModel()

            assertEquals(ServiceState.Ready(OPEN), viewModel.state.value.service)
            assertEquals(CourierListState.Hidden, viewModel.state.value.list)
            assertTrue(pageCalls().isEmpty())
        }

    @Test
    fun `con sesion carga mis entregas de la cuenta y la viva es la del banner`() =
        runTest {
            gateway.page = page(card("VIVA2345", "heading_to_pickup"), card("VIEJA234", "delivered"), next = "c1")
            val viewModel = viewModel()

            val list = viewModel.state.value.list as CourierListState.Loaded
            assertEquals(listOf("VIVA2345", "VIEJA234"), list.items.map { it.shortId })
            assertTrue(list.canLoadMore)
            assertEquals(
                "VIVA2345",
                viewModel.state.value.active
                    ?.shortId,
            )
            assertEquals(listOf("page:null:$ACCOUNT_A"), pageCalls())
        }

    @Test
    fun `sin entregas queda vacio y sin banner`() =
        runTest {
            gateway.page = page()
            val viewModel = viewModel()

            assertEquals(CourierListState.Empty, viewModel.state.value.list)
            assertNull(viewModel.state.value.active)
        }

    @Test
    fun `solo entregas terminadas no prenden el banner`() =
        runTest {
            gateway.page = page(card("ENTR2345", "delivered"), card("CANC2345", "cancelled"))
            val viewModel = viewModel()

            assertNull(viewModel.state.value.active)
        }

    @Test
    fun `sin conexion la lista queda en error y el estado del servicio tambien`() =
        runTest {
            gateway.status = ApiResult.Failure(network())
            gateway.page = ApiResult.Failure(network())
            val viewModel = viewModel()

            assertTrue((viewModel.state.value.list as CourierListState.Failed).error is AppError.Network)
            assertTrue((viewModel.state.value.service as ServiceState.Failed).error is AppError.Network)
        }

    @Test
    fun `un corte al refrescar no borra el abierto que ya se mostraba`() =
        runTest {
            val viewModel = viewModel()
            gateway.status = ApiResult.Failure(network())

            viewModel.refresh()

            assertEquals(ServiceState.Ready(OPEN), viewModel.state.value.service)
        }

    @Test
    fun `un 401 en la lista cierra la sesion y la lista se esconde`() =
        runTest {
            gateway.page = ApiResult.Failure(known(ApiErrorCode.Unauthorized, 401))
            val viewModel = viewModel()

            assertEquals(1, session.signOutCalls)
            assertEquals(listOf(ACCOUNT_A), session.signOutIfCalls)
            assertEquals(CourierListState.Hidden, viewModel.state.value.list)
            assertEquals(false, viewModel.state.value.signedIn)
        }

    @Test
    fun `un 426 en el estado o en la lista avisa que hay que actualizar`() =
        runTest {
            gateway.status = ApiResult.Failure(upgradeRequired())
            viewModel()
            assertTrue(upgradeReported())
        }

    @Test
    fun `un 426 en la lista tambien avisa`() =
        runTest {
            gateway.page = ApiResult.Failure(upgradeRequired())
            viewModel()
            assertTrue(upgradeReported())
        }

    @Test
    fun `al cambiar de cuenta A a B con la pagina de A en vuelo no se publica la de A y se pide la de B`() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            gateway.pageGate = gate
            gateway.page = page(card("DEA23456", "requested"))
            val viewModel = viewModel()

            session.switchTo(ACCOUNT_B)
            assertEquals(CourierListState.Loading, viewModel.state.value.list)
            gateway.page = page(card("DEB23456", "delivered"))
            gate.complete(Unit)

            val list = viewModel.state.value.list as CourierListState.Loaded
            assertEquals(listOf("DEB23456"), list.items.map { it.shortId })
            assertNull(viewModel.state.value.active)
            assertEquals(listOf("page:null:$ACCOUNT_A", "page:null:$ACCOUNT_B"), pageCalls())
        }

    @Test
    fun `un 401 atrasado de A despues de pasar a B no cierra la sesion de B`() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            gateway.pageGate = gate
            gateway.page = ApiResult.Failure(known(ApiErrorCode.Unauthorized, 401))
            val viewModel = viewModel()

            session.switchTo(ACCOUNT_B)
            // La petición de A (que iba a recibir el 401) se descarta al cambiar; la de B contesta bien.
            gateway.page = page(card("DEB23456", "delivered"))
            gate.complete(Unit)

            assertEquals(0, session.signOutCalls)
            assertEquals(SessionState.SignedIn(ACCOUNT_B), session.state.value)
            assertTrue(viewModel.state.value.list is CourierListState.Loaded)
        }

    @Test
    fun `cerrar sesion olvida la lista de la cuenta`() =
        runTest {
            gateway.page = page(card("DEA23456", "requested"))
            val viewModel = viewModel()

            session.switchToSignedOut()

            assertEquals(CourierListState.Hidden, viewModel.state.value.list)
            assertNull(viewModel.state.value.active)
        }

    @Test
    fun `ver mas agrega la pagina siguiente y un corte conserva lo mostrado`() =
        runTest {
            gateway.page = page(card("UNO23456", "delivered"), next = "c1")
            val viewModel = viewModel()

            gateway.page = ApiResult.Failure(network())
            viewModel.loadMore()
            val failed = viewModel.state.value.list as CourierListState.Loaded
            assertEquals(listOf("UNO23456"), failed.items.map { it.shortId })
            assertTrue(failed.loadMoreFailed)

            gateway.page = page(card("DOS23456", "delivered"))
            viewModel.loadMore()
            val loaded = viewModel.state.value.list as CourierListState.Loaded
            assertEquals(listOf("UNO23456", "DOS23456"), loaded.items.map { it.shortId })
            assertEquals(false, loaded.canLoadMore)
            assertEquals(listOf("page:null:$ACCOUNT_A", "page:c1:$ACCOUNT_A", "page:c1:$ACCOUNT_A"), pageCalls())
        }
}
