package com.tindivo.customer.feature.orders

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.config.ConfigState
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.Duration

/** La carga de `prepay-info`, la cuenta regresiva y la sesión mientras carga. El envío está en [PrepayViewModelSendTest]. */
@OptIn(ExperimentalCoroutinesApi::class)
class PrepayViewModelTest : PrepayHarness() {
    @Test
    fun `cargar muestra a quien pagar con la cuenta regresiva`() =
        runTest {
            val env = Env(this)
            env.gateway.infoResult = ApiResult.Success(prepayInfo(awaitingPaymentAt = "2026-11-10T14:55:00.000Z"))
            runCurrent()

            env.viewModel.load()
            assertEquals(PrepayInfoState.Loading, env.state.info)
            runCurrent()

            val expected =
                PrepayDetails(
                    businessName = "Pollería Rosa",
                    payee = PrepayPayee(PayWallet.Yape, "987654321", "Rosa P.", qrUrl = null),
                    lastTry = false,
                    deadline = NOW.plus(Duration.ofMinutes(10)),
                )
            assertEquals(PrepayInfoState.Ready(expected), env.state.info)
            assertEquals(PrepayCountdown.Remaining(10), env.state.countdown)
            assertEquals(listOf("info $PREPAY_ACCOUNT"), env.gateway.calls)
        }

    @Test
    fun `un error del servidor al cargar se muestra y volver a cargar lo arregla`() =
        runTest {
            val env = Env(this)
            val notFound = AppError.Known(ApiErrorCode.NotFound, 404, null)
            env.gateway.infoResult = ApiResult.Failure(notFound)
            env.viewModel.load()
            runCurrent()

            assertEquals(PrepayInfoState.Failed(notFound), env.state.info)

            env.gateway.infoResult = ApiResult.Success(prepayInfo())
            env.viewModel.load()
            runCurrent()

            assertTrue(env.state.info is PrepayInfoState.Ready)
            assertEquals(2, env.gateway.count("info"))
        }

    @Test
    fun `sin conexion al cargar queda el error de red y no se puede enviar`() =
        runTest {
            val env = Env(this)
            val offline = AppError.Network(IOException("sin red"))
            env.gateway.infoResult = ApiResult.Failure(offline)
            env.viewModel.load()
            runCurrent()
            env.viewModel.onPhotoPicked(PHOTO_A)

            assertEquals(PrepayInfoState.Failed(offline), env.state.info)
            assertFalse(env.state.canSend)
            env.viewModel.send()
            runCurrent()
            assertEquals(SendState.Idle, env.state.send)
            assertEquals(emptyList<String>(), env.encoder.photos)
        }

    @Test
    fun `un pedido que ya no espera el pago no ofrece enviar`() =
        runTest {
            val env = Env(this)
            env.gateway.infoResult = ApiResult.Success(prepayInfo(status = "validando"))
            env.viewModel.load()
            runCurrent()

            assertEquals(PrepayInfoState.NotAwaiting, env.state.info)
            env.viewModel.onPhotoPicked(PHOTO_A)
            assertFalse(env.state.canSend)
        }

    @Test
    fun `un 401 al cargar cierra la sesion y no se vuelve a pedir nada`() =
        runTest {
            val env = Env(this)
            env.gateway.infoResult = ApiResult.Failure(AppError.Known(ApiErrorCode.Unauthorized, 401, null))
            env.viewModel.load()
            runCurrent()

            assertEquals(1, env.store.signOutCalls)
            assertEquals(PrepayUiState(), env.state)

            env.gateway.infoResult = ApiResult.Success(prepayInfo())
            env.viewModel.load()
            runCurrent()
            assertEquals(1, env.gateway.count("info"))
            assertEquals(PrepayUiState(), env.state)
        }

    @Test
    fun `un 426 al cargar avisa que hay que actualizar la app`() =
        runTest {
            val env = Env(this)
            env.gateway.infoResult = ApiResult.Failure(AppError.UpgradeRequired("2.0.0"))
            env.viewModel.load()
            runCurrent()

            assertEquals(ConfigState.UpgradeRequired("2.0.0"), configService.state.value)
            assertEquals(PrepayInfoState.Failed(AppError.UpgradeRequired("2.0.0")), env.state.info)
        }

    @Test
    fun `mientras no se sabe la sesion no se pide nada y al saberla se pide`() =
        runTest {
            val env = Env(this, session = SessionState.Unknown)
            env.viewModel.load()
            runCurrent()
            assertTrue(env.gateway.calls.isEmpty())

            env.store.switchTo(PREPAY_ACCOUNT)
            runCurrent()

            assertEquals(listOf("info $PREPAY_ACCOUNT"), env.gateway.calls)
            assertTrue(env.state.info is PrepayInfoState.Ready)
        }

    @Test
    fun `sin un id de pedido valido no se pide nada`() =
        runTest {
            val env = Env(this, orderId = "no-es-un-uuid")
            env.viewModel.load()
            runCurrent()

            assertTrue(env.gateway.calls.isEmpty())
            assertEquals(PrepayInfoState.Idle, env.state.info)
        }

    @Test
    fun `si la sesion cambia o se cierra mientras carga no se publica nada de la cuenta anterior`() =
        runTest {
            // La respuesta llega antes o después de que el colector vea el cambio: en ningún orden se muestra.
            for (answerFirst in listOf(true, false)) {
                for (signOut in listOf(true, false)) {
                    val label = "respuesta primero=$answerFirst, cierre=$signOut"
                    val env = Env(this)
                    env.gates.hold("info")
                    env.viewModel.load()
                    runCurrent()

                    if (answerFirst) env.gates.release("info")
                    if (signOut) env.store.signOut() else env.store.switchTo("user-2")
                    env.gates.release("info")
                    runCurrent()

                    assertTrue(label, env.seen.none { it.info is PrepayInfoState.Ready })
                    assertEquals(label, PrepayUiState(), env.state)

                    // La pantalla vuelve a pedir: el ViewModel ya terminó y no pide con la cuenta nueva.
                    env.viewModel.load()
                    runCurrent()
                    assertEquals(label, listOf("info $PREPAY_ACCOUNT"), env.gateway.calls)
                }
            }
        }

    @Test
    fun `la cuenta regresiva baja minuto a minuto y al llegar a cero vence`() =
        runTest {
            val env = Env(this)
            // Vence a las 15:10:30: quedan 10 min 30 s, que se muestran como 11.
            env.gateway.infoResult = ApiResult.Success(prepayInfo(awaitingPaymentAt = "2026-11-10T14:55:30.000Z"))
            env.viewModel.load()
            runCurrent()
            env.viewModel.onPhotoPicked(PHOTO_A)
            assertEquals(PrepayCountdown.Remaining(11), env.state.countdown)
            assertTrue(env.state.canSend)

            advanceTimeBy(29_999)
            runCurrent()
            assertEquals(PrepayCountdown.Remaining(11), env.state.countdown)
            advanceTimeBy(1)
            runCurrent()
            assertEquals(PrepayCountdown.Remaining(10), env.state.countdown)

            advanceTimeBy(9 * 60_000L)
            runCurrent()
            assertEquals(PrepayCountdown.Remaining(1), env.state.countdown)
            advanceTimeBy(60_000)
            runCurrent()

            assertEquals(PrepayCountdown.Expired, env.state.countdown)
            assertFalse(env.state.canSend)
            env.viewModel.send()
            runCurrent()
            assertEquals(SendState.Idle, env.state.send)
            assertTrue(env.encoder.photos.isEmpty())

            // Vencida, deja de despertarse: no queda ninguna espera pendiente.
            val expiredAt = testScheduler.currentTime
            advanceUntilIdle()
            assertEquals(expiredAt, testScheduler.currentTime)
            val countdowns = env.seen.mapNotNull { it.countdown }.distinct()
            assertEquals((11L downTo 1L).map { PrepayCountdown.Remaining(it) } + PrepayCountdown.Expired, countdowns)
        }

    @Test
    fun `un plazo ya vencido al cargar se muestra vencido`() =
        runTest {
            val env = Env(this)
            env.gateway.infoResult = ApiResult.Success(prepayInfo(awaitingPaymentAt = "2026-11-10T14:00:00.000Z"))
            env.viewModel.load()
            runCurrent()

            assertEquals(PrepayCountdown.Expired, env.state.countdown)
        }

    @Test
    fun `sin la hora de inicio o sin los minutos del plazo no hay cuenta regresiva`() =
        runTest {
            val noStart = Env(this)
            noStart.viewModel.load()
            runCurrent()

            val noMinutes = Env(this)
            noMinutes.gateway.infoResult = ApiResult.Success(prepayInfo(awaitingPaymentAt = "2026-11-10T14:55:00.000Z"))
            noMinutes.gateway.minutes = null
            noMinutes.viewModel.load()
            runCurrent()

            for (env in listOf(noStart, noMinutes)) {
                assertNull(env.state.countdown)
                assertNull((env.state.info as PrepayInfoState.Ready).details.deadline)
            }
        }
}
