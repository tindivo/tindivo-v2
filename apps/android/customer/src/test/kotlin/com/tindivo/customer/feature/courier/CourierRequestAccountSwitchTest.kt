package com.tindivo.customer.feature.courier

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.customer.feature.checkout.Ledger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Cambio directo de cuenta A→B (sin pasar por «cerrar sesión») a mitad de «Pedir una entrega». */
@OptIn(ExperimentalCoroutinesApi::class)
class CourierRequestAccountSwitchTest : CourierHarness() {
    private val ledger = MemoryLedger()
    private val attempts = courierAttempts(ledger)

    private fun viewModel() = CourierRequestViewModel(gateway, attempts, session, config)

    @Test
    fun `lo que A escribio no pasa a B y B carga lo suyo`() =
        runTest {
            val viewModel = viewModel()
            viewModel.fill()
            viewModel.toggleMe(CourierEnd.Destination)

            session.switchTo(ACCOUNT_B)

            val state = viewModel.state.value
            assertEquals(RequestPhase.Form, state.phase)
            assertEquals(CourierDraft(), state.draft)
            assertTrue(gateway.calls.contains("requester:$ACCOUNT_B"))
        }

    @Test
    fun `la carga de A que llega despues de pasar a B no se publica`() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            gateway.requesterGate = gate
            gateway.requester = ApiResult.Success(ME.copy(fullName = "De A"))
            val viewModel = viewModel()

            session.switchTo(ACCOUNT_B)
            gateway.requester = ApiResult.Success(ME.copy(fullName = "De B"))
            gate.complete(Unit)

            assertEquals(
                "De B",
                viewModel.state.value.requester
                    ?.fullName,
            )
        }

    @Test
    fun `la entrega de A que se crea despues de pasar a B no se abre en B y su clave se cierra en A`() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            gateway.createGate = gate
            gateway.creates += ApiResult.Success(CREATED)
            val viewModel = viewModel()
            viewModel.fill()
            viewModel.submit()

            session.switchTo(ACCOUNT_B)
            gate.complete(Unit)

            val state = viewModel.state.value
            assertEquals(RequestPhase.Form, state.phase)
            assertNull(state.created)
            assertEquals(false, state.sending)
            assertEquals(listOf("create:$ACCOUNT_A"), gateway.calls.filter { it.startsWith("create:") })
            // El POST de A sí salió: la entrega existe y su clave se olvidó en el registro de A.
            assertEquals(Ledger(), ledger.ledger)
        }

    @Test
    fun `un corte de A despues de pasar a B deja la clave de A para su reintento y B pide con otra`() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            gateway.createGate = gate
            gateway.creates += ApiResult.Failure(network())
            val viewModel = viewModel()
            viewModel.fill()
            viewModel.submit()

            session.switchTo(ACCOUNT_B)
            gate.complete(Unit)
            assertNull(viewModel.state.value.message)

            gateway.createGate = null
            gateway.creates.clear()
            gateway.creates += ApiResult.Success(CREATED)
            viewModel.fill()
            viewModel.submit()

            assertEquals(2, gateway.sentKeys.toSet().size)
            assertTrue(ACCOUNT_A in ledger.ledger.attempts)
            assertEquals(
                listOf("create:$ACCOUNT_A", "create:$ACCOUNT_B"),
                gateway.calls.filter { it.startsWith("create:") },
            )
        }

    @Test
    fun `un 401 atrasado de A no cierra la sesion de B`() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            gateway.createGate = gate
            gateway.creates += ApiResult.Failure(known(ApiErrorCode.Unauthorized, 401))
            val viewModel = viewModel()
            viewModel.fill()
            viewModel.submit()

            session.switchTo(ACCOUNT_B)
            gate.complete(Unit)

            assertEquals(0, session.signOutCalls)
        }

    @Test
    fun `una hoja abierta por A no aplica nada en B`() =
        runTest {
            val viewModel = viewModel()
            viewModel.openSheet(CourierSheet.ChoosePoint(CourierEnd.Origin))

            session.switchTo(ACCOUNT_B)
            viewModel.pickAddress(CourierEnd.Origin, HOME.id)
            viewModel.pickContact(CourierEnd.Origin, 0)

            assertEquals(CourierDraft(), viewModel.state.value.draft)
        }
}
