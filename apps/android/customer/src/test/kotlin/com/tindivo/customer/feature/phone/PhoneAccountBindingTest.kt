package com.tindivo.customer.feature.phone

import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.PhoneRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.checkout.sessionJwt
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.GatedTokens
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/**
 * CAX-001: las tres operaciones del celular van atadas a la cuenta que abrió la pantalla, con el autenticador y el
 * interceptor reales. Las compuertas detienen el hilo de OkHttp justo al leer el token o al refrescarlo, y ahí la sesión
 * pasa a otra cuenta (el token cambia antes de que el colector del ViewModel vea el cambio): ningún intento sale con el
 * token de la otra cuenta y el cuerpo de esta.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PhoneAccountBindingTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()
    private val store = FakeSessionStore(SessionState.SignedIn(ACCOUNT_A))
    private val tokens = GatedTokens(sessionJwt(ACCOUNT_A))
    private val clock = Clock.fixed(Instant.parse("2026-10-30T15:00:00Z"), ZoneOffset.UTC)
    private lateinit var baseUrl: String
    private lateinit var configService: ConfigService

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server.start()
        baseUrl = server.url("/api/v1").toString().trimEnd('/')
        configService =
            ConfigService(SystemRepository(baseUrl, client(), dispatcher), "0.1.0", CoroutineScope(dispatcher))
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    private fun client() =
        createOkHttpClient(
            ClientInfo("customer", "0.1.0", "1"),
            retry = RetryInterceptor(sleeper = { _, _ -> }),
            auth = BearerAuthInterceptor(server.url("/"), tokens),
        )

    // Las llamadas corren en hilos de verdad: la compuerta bloquea el hilo de OkHttp, nunca el de la prueba.
    private fun viewModel() =
        PhoneVerifyViewModel(PhoneRepository(baseUrl, client(), Dispatchers.IO), store, configService, clock)

    private fun json(
        code: Int,
        body: String,
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", if (code == 200) "application/json" else "application/problem+json")
        .body(body)
        .build()

    private suspend fun PhoneVerifyViewModel.awaitIdle() =
        withContext(Dispatchers.Default) { withTimeout(WAIT_MILLIS) { state.first { !it.sending } } }

    /** Deja la pantalla en el paso del código con el número 987654321 (una petición, con el token de A). */
    private suspend fun PhoneVerifyViewModel.toCodeStep() {
        server.enqueue(json(200, SENT))
        onPhoneChanged("987654321")
        sendCode()
        awaitIdle()
        assertEquals(PhoneStep.Code, state.value.step)
        server.takeRequest()
    }

    /** Deja la pantalla con la oferta de traslado (dos peticiones). */
    private suspend fun PhoneVerifyViewModel.toTransferOffer() {
        toCodeStep()
        server.enqueue(json(409, CONFLICT_TRANSFER))
        onCodeChanged("123456")
        verify()
        awaitIdle()
        checkNotNull(state.value.transfer)
        server.takeRequest()
    }

    /** Una operación del celular: [prepare] llega al paso en que se puede tocar y [act] la toca. */
    private class Operation(
        val name: String,
        val prepare: suspend (PhoneVerifyViewModel) -> Unit,
        val act: (PhoneVerifyViewModel) -> Unit,
    )

    private val operations =
        listOf(
            Operation("send-code", { it.onPhoneChanged("987654321") }) { it.sendCode() },
            Operation("verify", { it.toCodeStep() }) {
                it.onCodeChanged("123456")
                it.verify()
            },
            Operation("transfer", { it.toTransferOffer() }) { it.confirmTransfer() },
        )

    /** Vuelve a la cuenta A, con su token y sin refresco. */
    private fun reset() {
        tokens.token = sessionJwt(ACCOUNT_A)
        tokens.onRefresh = null
        store.switchTo(ACCOUNT_A)
    }

    @Test
    fun `si la sesion pasa a otra cuenta antes de leer el token ninguna operacion sale con el token de B`() =
        runTest {
            for (operation in operations) {
                val name = operation.name
                reset()
                val viewModel = viewModel()
                operation.prepare(viewModel)
                val before = server.requestCount
                val gate = tokens.holdNextRead()
                operation.act(viewModel)

                withContext(Dispatchers.IO) { gate.awaitReached() }
                tokens.token = sessionJwt(ACCOUNT_B)
                gate.release()
                withContext(Dispatchers.Default) { withTimeout(WAIT_MILLIS) { viewModel.state.first { it.loggedOut } } }

                assertEquals(name, before, server.requestCount)
                assertEquals(name, PhoneUiState(loggedOut = true), viewModel.state.value)
            }
            assertEquals(0, store.signOutCalls)
        }

    @Test
    fun `si el refresco tras un 401 trae otra cuenta ninguna operacion se repite con el token de B`() =
        runTest {
            for (operation in operations) {
                val name = operation.name
                reset()
                val viewModel = viewModel()
                operation.prepare(viewModel)
                server.enqueue(json(401, UNAUTHORIZED))
                val gate = tokens.holdNextRefresh()
                operation.act(viewModel)

                withContext(Dispatchers.IO) { gate.awaitReached() }
                tokens.onRefresh = sessionJwt(ACCOUNT_B)
                gate.release()
                withContext(Dispatchers.Default) { withTimeout(WAIT_MILLIS) { viewModel.state.first { it.loggedOut } } }

                // Salió un solo intento de la operación, con el token de A; la repetición con el de B no salió.
                val sent = server.takeRequest()
                assertEquals(name, "Bearer ${sessionJwt(ACCOUNT_A)}", sent.headers["Authorization"])
                assertEquals(name, PhoneUiState(loggedOut = true), viewModel.state.value)
            }
            // Ningún intento con el token de B llegó al servidor.
            assertEquals(1 + 2 + 3, server.requestCount)
            assertEquals(0, store.signOutCalls)
        }

    @Test
    fun `sin sesion al abrir la pantalla nace cerrada y no llama`() =
        runTest {
            store.signOut()
            val viewModel = viewModel()

            viewModel.onPhoneChanged("987654321")
            viewModel.sendCode()

            assertEquals(PhoneUiState(loggedOut = true), viewModel.state.value)
            assertEquals(0, server.requestCount)
        }

    private companion object {
        const val ACCOUNT_A = "6f1c3a52-9d0e-4c1b-8a77-2f4e5d6c7b8a"
        const val ACCOUNT_B = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b"
        const val WAIT_MILLIS = 5_000L
        const val SENT = """{"data":{"sent":true,"channel":"sms"}}"""
        const val UNAUTHORIZED = """{"type":"about:blank","title":"No autorizado","status":401,"code":"unauthorized"}"""
        const val CONFLICT_TRANSFER = """
            {"type":"about:blank","title":"Conflicto","status":409,"code":"conflict",
             "detail":"Ese número ya está verificado en otra cuenta.",
             "transfer":{"challengeId":"7c2a737a-018f-4c2d-9a11-6f0d3c1e8a09","expiresAt":"2026-10-30T10:10:00-05:00"}}
        """
    }
}
