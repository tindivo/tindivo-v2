package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.AccessGrant
import com.tindivo.core.network.AccessTokenSource
import com.tindivo.customer.session.FakeBackend
import com.tindivo.customer.session.SupabaseSessionStore
import com.tindivo.customer.session.TokenSnapshot
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Entrar desde el checkout con la aceptación de Términos pendiente: la pantalla carga en cuanto se publica la sesión,
 * antes del 2xx de la aceptación. Esa carga espera en la red y, confirmada la aceptación, deja el formulario cargado
 * en vez de quedarse en `LoadFailed`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutPendingTermsLoadTest : CheckoutHarness() {
    private val io = ControlledIo(dispatcher)

    @After
    fun drainIo() {
        io.awaitIdle()
        io.controlled = false
    }

    @Test
    fun `entrar con la aceptacion pendiente y confirmarla despues deja el checkout cargado y no en LoadFailed`() =
        runTest(dispatcher) {
            val backend =
                FakeBackend().apply {
                    signInResult = { TokenSnapshot(sessionJwt("user-1"), "user-1", 2_000_000L, termsPending = true) }
                }
            val clock = Clock.fixed(Instant.ofEpochSecond(1_000_000L), ZoneOffset.UTC)
            val real = SupabaseSessionStore(backend, clock, backgroundScope)
            real.signInWithGoogle("id", "nonce", termsPending = true)
            val reachedInterceptor = CountDownLatch(1)
            wire(io, SignalingSource(real, reachedInterceptor))
            fillCart()
            io.controlled = true
            val vm = viewModel()
            runCurrent()
            // Confirma solo cuando la carga ya llegó al interceptor y quedó retenida: sin el arreglo habría fallado antes.
            assertTrue(reachedInterceptor.await(5, TimeUnit.SECONDS))
            assertEquals(0, requests.size)

            assertEquals(true, real.confirmTerms("user-1"))
            do {
                advanceUntilIdle()
            } while (io.awaitIdle())

            assertEquals(CheckoutPhase.Form, vm.state.value.phase)
        }
}

/** Avisa cuando una petición entra a esperar la aceptación; el resto lo delega en la sesión real. */
private class SignalingSource(
    private val delegate: SupabaseSessionStore,
    private val reached: CountDownLatch,
) : AccessTokenSource {
    override suspend fun accessToken() = delegate.accessToken()

    override suspend fun refresh() = delegate.refresh()

    override suspend fun accessGrant() = delegate.accessGrant()

    override suspend fun awaitTermsResolution(): AccessGrant {
        reached.countDown()
        return delegate.awaitTermsResolution()
    }
}
