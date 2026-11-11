package com.tindivo.customer.feature.orders

import androidx.lifecycle.SavedStateHandle
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.session.FakeBackend
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SupabaseSessionStore
import com.tindivo.customer.session.TEST_NOW
import com.tindivo.customer.session.TokenSnapshot
import com.tindivo.customer.session.testClock
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * El 401 de la sección «Paga tu pedido» de A llega mientras B está entrando: la entrada de B tiene el candado del
 * almacén de sesión real. Cuando la continuación del 401 mira la sesión, todavía es A; el cierre espera el candado, y
 * para cuando lo obtiene la sesión ya es B. Ese 401 de A no puede cerrar la sesión de B: comprobar la cuenta y cerrar
 * van en un solo paso. Se prueba al pedir `prepay-info` y al confirmar el comprobante.
 *
 * Todo corre en el despachador de la prueba (nada avanza sin `runCurrent()`), con el almacén de sesión real y solo Auth
 * como doble, así el orden de la carrera es siempre el mismo.
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal class PrepayLateUnauthorizedTest : PrepayHarness() {
    private val backend = FakeBackend().apply { stored = TokenSnapshot("token-a", PREPAY_ACCOUNT, TEST_NOW + 3600) }
    private val gates = StepGates()
    private val gateway = FakePrepayGateway(gates)
    private val unauthorized = ApiResult.Failure(AppError.Known(ApiErrorCode.Unauthorized, 401, null))

    private fun TestScope.realStore(): SupabaseSessionStore {
        val store = SupabaseSessionStore(backend, testClock, backgroundScope)
        runCurrent()
        return store
    }

    private fun TestScope.viewModel(store: SupabaseSessionStore): PrepayViewModel {
        val vm =
            PrepayViewModel(
                SavedStateHandle(mapOf("id" to ORDER_ID.toString())),
                gateway,
                FakeProofEncoder(gates),
                store,
                configService,
                SchedulerClock(testScheduler),
            )
        runCurrent()
        return vm
    }

    /** B empieza a entrar y se queda a medias con el candado tomado; se suelta completando lo devuelto. */
    private fun TestScope.startEnteringB(store: SupabaseSessionStore): CompletableDeferred<Unit> {
        val entering = CompletableDeferred<Unit>()
        backend.signInGate = { entering.await() }
        backend.signInResult = { TokenSnapshot("token-b", OTHER_ACCOUNT, TEST_NOW + 3600) }
        backgroundScope.launch { store.signInWithGoogle("id-token-b", "nonce") }
        runCurrent()
        assertEquals(SessionState.SignedIn(PREPAY_ACCOUNT), store.state.value)
        return entering
    }

    @Test
    fun `un 401 tardio de prepay-info de A no cierra la sesion de B`() =
        runTest {
            val store = realStore()
            val vm = viewModel(store)
            gates.hold("info")
            vm.load()
            runCurrent()
            assertEquals(listOf("info $PREPAY_ACCOUNT"), gateway.calls)

            val entering = startEnteringB(store)

            // El 401 de A: su continuación aún ve la sesión de A y pide cerrar; el cierre espera el candado.
            gateway.infoResult = unauthorized
            gates.release("info")
            runCurrent()

            // B termina de entrar; recién entonces corre el cierre que pidió el 401 de A.
            entering.complete(Unit)
            runCurrent()

            assertEquals(SessionState.SignedIn(OTHER_ACCOUNT), store.state.value)
            assertEquals(0, backend.signOutCalls)
            assertEquals(PrepayUiState(), vm.state.value)
        }

    @Test
    fun `un 401 tardio al confirmar el comprobante de A no cierra la sesion de B`() =
        runTest {
            val store = realStore()
            val vm = viewModel(store)
            vm.load()
            runCurrent()
            vm.onPhotoPicked(PHOTO_A)
            gates.hold("confirm")
            gateway.confirmResults += unauthorized
            vm.send()
            runCurrent()
            assertEquals("confirm", gateway.calls.last().substringBefore(' '))

            val entering = startEnteringB(store)

            // El 401 de A al confirmar: su continuación aún ve la sesión de A y pide cerrar; el cierre espera el candado.
            gates.release("confirm")
            runCurrent()

            // B termina de entrar; recién entonces corre el cierre que pidió el 401 de A.
            entering.complete(Unit)
            runCurrent()

            assertEquals(SessionState.SignedIn(OTHER_ACCOUNT), store.state.value)
            assertEquals(0, backend.signOutCalls)
            assertEquals(PrepayUiState(), vm.state.value)
        }

    private companion object {
        const val OTHER_ACCOUNT = "user-2"
    }
}
