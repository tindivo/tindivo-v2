package com.tindivo.customer.feature.courier

import androidx.lifecycle.SavedStateHandle
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.feature.orders.PollingDelay
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class CourierDetailViewModelTest : CourierHarness() {
    private val waits = mutableListOf<Long>()
    private val release = Channel<Unit>(Channel.UNLIMITED)
    private val polling =
        PollingDelay { millis ->
            waits += millis
            release.receive()
        }
    private val clock = VirtualClock(START) { dispatcher.scheduler.currentTime }

    private fun viewModel() =
        CourierDetailViewModel(
            SavedStateHandle(mapOf("id" to COURIER_ID.toString(), "shortId" to "AB23CD45")),
            gateway,
            session,
            config,
            polling,
            clock,
        )

    private fun TestScope.watched(): CourierDetailViewModel {
        val viewModel = viewModel()
        backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
        backgroundScope.launch(dispatcher) { viewModel.countdown.collect {} }
        return viewModel
    }

    private fun CourierDetailViewModel.shown(): CourierTrackingUi =
        (state.value as CourierDetailUiState.Loaded).tracking

    private fun trackingCalls() = gateway.calls.filter { it.startsWith("tracking:") }

    private fun cancelCalls() = gateway.calls.filter { it.startsWith("cancel:") }

    @Test
    fun `carga la entrega con la cuenta y vuelve a consultar cada 8 segundos mientras sigue viva`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("requested"))
            gateway.trackings += ApiResult.Success(tracking("accepted", driverName = "Luis"))
            val viewModel = watched()

            assertEquals(CourierPhase.Active(CourierStep.Requested, CourierHeadline.Searching), viewModel.shown().phase)
            assertEquals(listOf(COURIER_POLL_MILLIS), waits)
            release.send(Unit)

            assertEquals(CourierStep.Confirmed, (viewModel.shown().phase as CourierPhase.Active).step)
            assertEquals("Luis", viewModel.shown().driverName)
            assertEquals(listOf("tracking:AB23CD45:$ACCOUNT_A", "tracking:AB23CD45:$ACCOUNT_A"), trackingCalls())
        }

    @Test
    fun `al llegar a entregada el sondeo se apaga`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("picked_up"))
            gateway.trackings += ApiResult.Success(tracking("delivered"))
            val viewModel = watched()

            release.send(Unit)
            release.send(Unit)

            assertEquals(CourierPhase.Delivered, viewModel.shown().phase)
            assertEquals(1, waits.size)
            assertEquals(2, trackingCalls().size)
        }

    @Test
    fun `cancelada por falta de motorizado es terminal y dice que no se cobro nada`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("cancelled", cancelReason = NO_DRIVER))
            val viewModel = watched()

            val phase = viewModel.shown().phase
            assertTrue(phase.isTerminal())
            assertTrue(phase.wasFree())
            assertTrue(waits.isEmpty())
            // Otro motivo no es «sin cobro».
            assertFalse(courierPhaseOf("cancelled", "customer_cancelled").wasFree())
            assertFalse(courierPhaseOf("delivered", null).wasFree())
        }

    @Test
    fun `sin conexion al abrir queda el error y reintentar vuelve a consultar`() =
        runTest {
            gateway.trackings += ApiResult.Failure(network())
            gateway.trackings += ApiResult.Success(tracking("delivered"))
            val viewModel = watched()

            assertTrue((viewModel.state.value as CourierDetailUiState.Failed).error is AppError.Network)
            viewModel.retry()

            assertEquals(CourierPhase.Delivered, viewModel.shown().phase)
        }

    @Test
    fun `un corte durante el sondeo conserva lo que ya se mostraba y sigue consultando`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("accepted"))
            gateway.trackings += ApiResult.Failure(network())
            gateway.trackings += ApiResult.Success(tracking("picked_up"))
            val viewModel = watched()

            release.send(Unit)
            assertEquals(CourierStep.Confirmed, (viewModel.shown().phase as CourierPhase.Active).step)
            release.send(Unit)
            assertEquals(CourierStep.OnTheWay, (viewModel.shown().phase as CourierPhase.Active).step)
        }

    @Test
    fun `un 404 es no encontrada y no se sigue consultando`() =
        runTest {
            gateway.trackings += ApiResult.Failure(known(ApiErrorCode.NotFound, 404))
            val viewModel = watched()

            assertEquals(CourierDetailUiState.NotFound, viewModel.state.value)
            assertTrue(waits.isEmpty())
        }

    @Test
    fun `un 401 cierra la sesion y la pantalla vuelve atras`() =
        runTest {
            gateway.trackings += ApiResult.Failure(known(ApiErrorCode.Unauthorized, 401))
            val viewModel = watched()

            assertEquals(CourierDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, session.signOutCalls)
            assertEquals(listOf(ACCOUNT_A), session.signOutIfCalls)
        }

    @Test
    fun `un 426 avisa que hay que actualizar`() =
        runTest {
            gateway.trackings += ApiResult.Failure(upgradeRequired())
            watched()

            assertTrue(upgradeReported())
        }

    @Test
    fun `al cambiar de cuenta A a B con la consulta en vuelo la respuesta de A no se muestra`() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            gateway.trackingGate = gate
            gateway.trackings += ApiResult.Success(tracking("requested", driverName = "De A"))
            val viewModel = watched()

            session.switchTo(ACCOUNT_B)
            gate.complete(Unit)

            assertEquals(CourierDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(listOf("tracking:AB23CD45:$ACCOUNT_A"), trackingCalls())
            assertEquals(0, session.signOutCalls)
            // Nada de B: ni reintentar ni cancelar sale con la otra cuenta.
            viewModel.retry()
            viewModel.askCancel()
            viewModel.confirmCancel()
            assertEquals(1, gateway.calls.count { it.startsWith("tracking:") || it.startsWith("cancel:") })
        }

    @Test
    fun `un 401 atrasado de A despues de pasar a B no cierra la sesion de B`() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            gateway.trackingGate = gate
            gateway.trackings += ApiResult.Failure(known(ApiErrorCode.Unauthorized, 401))
            val viewModel = watched()

            session.switchTo(ACCOUNT_B)
            gate.complete(Unit)

            assertEquals(CourierDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(0, session.signOutCalls)
        }

    @Test
    fun `cancelar pide un segundo toque y un toque doble mientras cancela envia una sola vez`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("requested"))
            gateway.trackings += ApiResult.Success(tracking("cancelled", cancelReason = "customer_cancelled"))
            val gate = CompletableDeferred<Unit>()
            gateway.cancelGate = gate
            val viewModel = watched()

            viewModel.confirmCancel()
            assertTrue(gateway.calls.none { it.startsWith("cancel:") })

            viewModel.askCancel()
            assertTrue(viewModel.cancel.value.confirming)
            viewModel.confirmCancel()
            viewModel.confirmCancel()
            assertTrue(viewModel.cancel.value.cancelling)
            gate.complete(Unit)

            assertEquals(listOf("cancel:$COURIER_ID:$ACCOUNT_A"), gateway.calls.filter { it.startsWith("cancel:") })
            assertEquals(CancelUiState(), viewModel.cancel.value)
            assertEquals(CourierPhase.Cancelled("customer_cancelled"), viewModel.shown().phase)
        }

    @Test
    fun `un 409 porque el motorizado la tomo justo antes recarga y lo dice`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("requested"))
            gateway.trackings += ApiResult.Success(tracking("accepted", driverName = "Luis"))
            gateway.cancelResult =
                ApiResult.Failure(known(ApiErrorCode.Conflict, 409, "Esta entrega ya no se puede cancelar."))
            val viewModel = watched()

            viewModel.askCancel()
            viewModel.confirmCancel()

            assertEquals(
                CourierMessage.Server("Esta entrega ya no se puede cancelar."),
                viewModel.cancel.value.message,
            )
            assertFalse(viewModel.cancel.value.confirming)
            assertEquals(CourierStep.Confirmed, (viewModel.shown().phase as CourierPhase.Active).step)
            assertEquals(2, trackingCalls().size)
            // Ya la tomó un motorizado: no se puede volver a pedir cancelar.
            viewModel.askCancel()
            assertFalse(viewModel.cancel.value.confirming)
        }

    @Test
    fun `tras un 409 con la recarga retenida no se puede volver a cancelar (CAX-003)`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("requested"))
            gateway.trackings += ApiResult.Success(tracking("accepted", driverName = "Luis"))
            gateway.cancelResult =
                ApiResult.Failure(known(ApiErrorCode.Conflict, 409, "Esta entrega ya no se puede cancelar."))
            val viewModel = watched()
            val reload = CompletableDeferred<Unit>()
            gateway.trackingGate = reload

            viewModel.askCancel()
            viewModel.confirmCancel()
            // La recarga sigue esperando: en pantalla, el seguimiento de antes («se puede cancelar»).
            assertTrue(viewModel.shown().phase.isCancellable())
            viewModel.askCancel()
            viewModel.confirmCancel()

            assertEquals("POST de cancelar", 1, cancelCalls().size)
            assertFalse(viewModel.cancel.value.confirming)
            assertTrue(viewModel.cancel.value.locked)

            // Llega el seguimiento al día: ya no se puede cancelar y el bloqueo se suelta.
            reload.complete(Unit)
            assertEquals(CourierStep.Confirmed, (viewModel.shown().phase as CourierPhase.Active).step)
            assertFalse(viewModel.cancel.value.locked)
            assertEquals(1, cancelCalls().size)
        }

    @Test
    fun `tras cancelar con la recarga pendiente no se vuelve a ofrecer cancelar (CAX-003)`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("requested"))
            gateway.trackings += ApiResult.Success(tracking("cancelled", cancelReason = "customer_cancelled"))
            val viewModel = watched()
            val reload = CompletableDeferred<Unit>()
            gateway.trackingGate = reload

            viewModel.askCancel()
            viewModel.confirmCancel()
            assertTrue(viewModel.shown().phase.isCancellable())
            viewModel.askCancel()
            viewModel.confirmCancel()
            viewModel.dismissCancel()
            viewModel.askCancel()
            viewModel.confirmCancel()

            assertEquals("POST de cancelar", 1, cancelCalls().size)
            assertFalse(viewModel.cancel.value.confirming)
            assertTrue(viewModel.cancel.value.locked)

            reload.complete(Unit)
            assertEquals(CourierPhase.Cancelled("customer_cancelled"), viewModel.shown().phase)
            assertEquals(CancelUiState(), viewModel.cancel.value)
            assertEquals(1, cancelCalls().size)
        }

    @Test
    fun `sin conexion al cancelar lo dice y no cierra nada`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("requested"))
            gateway.cancelResult = ApiResult.Failure(network())
            val viewModel = watched()

            viewModel.askCancel()
            viewModel.confirmCancel()

            assertEquals(CourierMessage.Network, viewModel.cancel.value.message)
            assertEquals(0, session.signOutCalls)
        }

    @Test
    fun `la respuesta de cancelar que llega despues de cambiar de cuenta no se aplica`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("requested"))
            val gate = CompletableDeferred<Unit>()
            gateway.cancelGate = gate
            gateway.cancelResult = ApiResult.Failure(known(ApiErrorCode.Unauthorized, 401))
            val viewModel = watched()

            viewModel.askCancel()
            viewModel.confirmCancel()
            session.switchTo(ACCOUNT_B)
            gate.complete(Unit)

            assertEquals(CourierDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(CancelUiState(), viewModel.cancel.value)
            assertEquals(0, session.signOutCalls)
            assertEquals(1, trackingCalls().size)
        }

    @Test
    fun `la cuenta regresiva va contra el plazo del servidor, se pone roja a los 5 minutos y se detiene en cero`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("requested", acceptDeadline = START.plusSeconds(900)))
            val viewModel = watched()

            assertEquals(AcceptCountdownUi(900, 900), viewModel.countdown.value)
            assertEquals(false, viewModel.countdown.value?.late)

            testScheduler.advanceTimeBy(599_000)
            testScheduler.runCurrent()
            assertEquals(301L, viewModel.countdown.value?.secondsLeft)
            assertEquals(false, viewModel.countdown.value?.late)

            testScheduler.advanceTimeBy(1_000)
            testScheduler.runCurrent()
            assertEquals(300L, viewModel.countdown.value?.secondsLeft)
            assertEquals(true, viewModel.countdown.value?.late)

            testScheduler.advanceTimeBy(300_000)
            testScheduler.runCurrent()
            assertEquals(true, viewModel.countdown.value?.expired)
            assertEquals("00:00", viewModel.countdown.value?.clock)

            // A cero ya no hay tick: la hora no se vuelve a leer.
            val reads = clock.reads
            testScheduler.advanceTimeBy(60_000)
            testScheduler.runCurrent()
            assertEquals(reads, clock.reads)
        }

    @Test
    fun `sin plazo del servidor, o con la entrega ya tomada, no hay cuenta regresiva`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("requested"))
            gateway.trackings += ApiResult.Success(tracking("accepted", acceptDeadline = START.plusSeconds(900)))
            val viewModel = watched()

            assertNull(viewModel.countdown.value)
            release.send(Unit)
            assertNull(viewModel.countdown.value)
        }

    @Test
    fun `la cuenta regresiva se apaga en cuanto un motorizado acepta`() =
        runTest {
            gateway.trackings += ApiResult.Success(tracking("requested", acceptDeadline = START.plusSeconds(900)))
            gateway.trackings += ApiResult.Success(tracking("accepted", acceptDeadline = START.plusSeconds(900)))
            val viewModel = watched()
            assertEquals(900L, viewModel.countdown.value?.secondsLeft)

            release.send(Unit)
            assertNull(viewModel.countdown.value)
            val reads = clock.reads
            testScheduler.advanceTimeBy(10_000)
            assertEquals(reads, clock.reads)
        }

    private companion object {
        val START: Instant = Instant.parse("2026-11-10T23:00:00Z")
    }
}
