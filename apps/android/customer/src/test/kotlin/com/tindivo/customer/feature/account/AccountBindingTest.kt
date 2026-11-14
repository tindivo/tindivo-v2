package com.tindivo.customer.feature.account

import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CustomerRepository
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
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * CAX-003: «Mi cuenta» carga solo con el token de la cuenta que la abrió, se cierra ante un cierre o un cambio directo
 * de cuenta, y un perfil que llega cuando la sesión vigente ya es otra no se publica. Con el autenticador y el
 * interceptor reales; el hilo principal es un [StandardTestDispatcher] y las llamadas van por un único hilo de verdad
 * ([drain] espera a que termine la que tiene).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AccountBindingTest {
    private val main = StandardTestDispatcher()
    private val server = MockWebServer()
    private val store = FakeSessionStore(SessionState.SignedIn(ACCOUNT_A))
    private val tokens = GatedTokens(sessionJwt(ACCOUNT_A))
    private val executor = Executors.newSingleThreadExecutor()
    private val io = executor.asCoroutineDispatcher()
    private lateinit var customer: CustomerRepository
    private lateinit var configService: ConfigService

    @Before
    fun setUp() {
        Dispatchers.setMain(main)
        server.start()
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                retry = RetryInterceptor(sleeper = { _, _ -> }),
                auth = BearerAuthInterceptor(server.url("/"), tokens),
            )
        customer = CustomerRepository(baseUrl, client, io)
        configService = ConfigService(SystemRepository(baseUrl, client, io), "0.1.0", CoroutineScope(main))
    }

    @After
    fun tearDown() {
        server.close()
        executor.shutdownNow()
        Dispatchers.resetMain()
    }

    private fun profileOfA() =
        MockResponse
            .Builder()
            .code(200)
            .addHeader("Content-Type", "application/json")
            .body(
                "{\"data\":{\"fullName\":\"$NAME_A\",\"phone\":\"$PHONE_A\",\"phoneVerified\":true," +
                    "\"phoneVerifiedAt\":null,\"contraentregaBlocked\":false,\"blockedUntil\":null,\"blocked\":false}}",
            ).build()

    private fun problem(
        status: Int,
        body: String,
    ) = MockResponse
        .Builder()
        .code(status)
        .addHeader("Content-Type", "application/problem+json")
        .body(body)
        .build()

    private fun drain() {
        executor.submit {}.get(WAIT_SECONDS, TimeUnit.SECONDS)
    }

    /** Todo lo que publica la pantalla, uno por uno (el colector sin confinar ve cada valor). */
    private fun TestScope.recordStates(viewModel: AccountViewModel): List<AccountUiState> {
        val seen = mutableListOf<AccountUiState>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { viewModel.state.toList(seen) }
        return seen
    }

    private fun List<AccountUiState>.showsA() = any { it is AccountUiState.Loaded && it.profile.fullName == NAME_A }

    private fun List<AccountUiState>.showsError() = any { it is AccountUiState.Failed }

    /** La pantalla de A, sin perfil todavía: es la que abre «Completa tu perfil» y recarga al volver. */
    private fun TestScope.profileMissingScreen(): AccountViewModel {
        server.enqueue(problem(404, PROFILE_MISSING))
        val viewModel = AccountViewModel(customer, store, configService)
        runCurrent()
        drain()
        runCurrent()
        assertEquals(AccountUiState.ProfileMissing(openNow = true), viewModel.state.value)
        viewModel.onProfilePromptOpened()
        return viewModel
    }

    @Test
    fun `si la sesion pasa a otra cuenta antes de leer el token el perfil no se pide`() =
        runTest(main) {
            val gate = tokens.holdNextRead()
            val viewModel = AccountViewModel(customer, store, configService)
            runCurrent()

            gate.awaitReached()
            tokens.token = sessionJwt(ACCOUNT_B)
            gate.release()
            drain()
            runCurrent()

            assertEquals(0, server.requestCount)
            assertEquals(AccountUiState.LoggedOut, viewModel.state.value)
            assertEquals(0, store.signOutCalls)
        }

    @Test
    fun `el perfil de A que llega con la sesion ya en B no se publica`() =
        runTest(main) {
            server.enqueue(profileOfA())
            val viewModel = AccountViewModel(customer, store, configService)
            val seen = recordStates(viewModel)
            runCurrent()

            // La respuesta de A ya espera en la cola; recién ahora entra B, antes de que el colector lo vea.
            drain()
            store.switchTo(ACCOUNT_B)
            runCurrent()

            assertEquals(1, server.requestCount)
            assertTrue(seen.toString(), !seen.showsA())
            assertEquals(AccountUiState.LoggedOut, viewModel.state.value)
            assertEquals(0, store.signOutCalls)
        }

    @Test
    fun `el perfil que llega despues de cerrar la sesion no se publica y la pantalla no vuelve a cargar`() =
        runTest(main) {
            server.enqueue(profileOfA())
            val viewModel = AccountViewModel(customer, store, configService)
            val seen = recordStates(viewModel)
            runCurrent()

            store.signOut()
            runCurrent()
            drain()
            runCurrent()
            viewModel.load()
            runCurrent()

            assertTrue(seen.toString(), !seen.showsA())
            assertEquals(AccountUiState.LoggedOut, viewModel.state.value)
            assertTrue(server.requestCount <= 1)
        }

    @Test
    fun `un cambio directo de cuenta cierra la pantalla de A ya cargada y no carga a B en ella`() =
        runTest(main) {
            server.enqueue(profileOfA())
            val viewModel = AccountViewModel(customer, store, configService)
            runCurrent()
            drain()
            runCurrent()
            assertTrue(viewModel.state.value is AccountUiState.Loaded)

            store.switchTo(ACCOUNT_B)
            tokens.token = sessionJwt(ACCOUNT_B)
            runCurrent()
            viewModel.load()
            runCurrent()

            assertEquals(AccountUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `cerrar sesion desde la pantalla de A no cierra la sesion de B`() =
        runTest(main) {
            server.enqueue(profileOfA())
            val viewModel = AccountViewModel(customer, store, configService)
            runCurrent()
            drain()
            runCurrent()

            // B entra y, antes de que el colector lo vea, llega el toque en «Cerrar sesión» de la pantalla de A.
            store.switchTo(ACCOUNT_B)
            viewModel.signOut()
            runCurrent()

            assertEquals(SessionState.SignedIn(ACCOUNT_B), store.state.value)
            assertEquals(0, store.signOutCalls)
        }

    @Test
    fun `el perfil sale con el token de la cuenta de la pantalla`() =
        runTest(main) {
            server.enqueue(profileOfA())
            AccountViewModel(customer, store, configService)
            runCurrent()
            drain()
            runCurrent()

            assertEquals("Bearer ${sessionJwt(ACCOUNT_A)}", server.takeRequest().headers["Authorization"])
        }

    @Test
    fun `un error de la lectura de A que llega con la sesion ya en B no se muestra en la pantalla de B`() =
        runTest(main) {
            server.enqueue(problem(404, NOT_FOUND))
            val viewModel = AccountViewModel(customer, store, configService)
            val seen = recordStates(viewModel)
            runCurrent()

            drain()
            store.switchTo(ACCOUNT_B)
            runCurrent()

            assertEquals(1, server.requestCount)
            assertTrue(seen.toString(), !seen.showsError())
            assertEquals(AccountUiState.LoggedOut, viewModel.state.value)
            assertEquals(0, store.signOutCalls)
        }

    @Test
    fun `un 401 de la lectura de A que llega con la sesion ya en B no cierra la sesion de B`() =
        runTest(main) {
            server.enqueue(problem(401, UNAUTHORIZED))
            val viewModel = AccountViewModel(customer, store, configService)
            val seen = recordStates(viewModel)
            runCurrent()

            drain()
            store.switchTo(ACCOUNT_B)
            runCurrent()

            assertTrue(seen.toString(), !seen.showsError())
            assertEquals(AccountUiState.LoggedOut, viewModel.state.value)
            assertEquals(SessionState.SignedIn(ACCOUNT_B), store.state.value)
            assertEquals(0, store.signOutCalls)
        }

    @Test
    fun `la recarga al volver de completar el perfil que llega con la sesion ya en B no publica el perfil de A`() =
        runTest(main) {
            val viewModel = profileMissingScreen()
            val seen = recordStates(viewModel)

            // Volvió de «Completa tu perfil» (AccountScreen: `profile.completed`): la recarga sale con el token de A.
            server.enqueue(profileOfA())
            viewModel.load()
            runCurrent()
            drain()
            store.switchTo(ACCOUNT_B)
            runCurrent()

            assertEquals(2, server.requestCount)
            assertTrue(seen.toString(), !seen.showsA())
            assertTrue(seen.toString(), !seen.showsError())
            assertEquals(AccountUiState.LoggedOut, viewModel.state.value)
            assertEquals(0, store.signOutCalls)
        }

    @Test
    fun `si B entro antes de volver de completar el perfil la recarga no pide nada`() =
        runTest(main) {
            val viewModel = profileMissingScreen()

            store.switchTo(ACCOUNT_B)
            tokens.token = sessionJwt(ACCOUNT_B)
            runCurrent()
            viewModel.load()
            runCurrent()
            drain()
            runCurrent()

            assertEquals(1, server.requestCount)
            assertEquals(AccountUiState.LoggedOut, viewModel.state.value)
        }

    @Test
    fun `si la sesion pasa a B mientras se refresca el token de A la recarga no sale con B`() =
        runTest(main) {
            val viewModel = profileMissingScreen()
            val seen = recordStates(viewModel)
            server.enqueue(problem(401, UNAUTHORIZED))
            tokens.onRefresh = sessionJwt(ACCOUNT_B)
            val gate = tokens.holdNextRefresh()

            viewModel.load()
            runCurrent()
            gate.awaitReached()
            store.switchTo(ACCOUNT_B)
            gate.release()
            drain()
            runCurrent()

            // Solo salieron la primera lectura y la de A con su token; nada con el de B.
            assertEquals(2, server.requestCount)
            server.takeRequest()
            assertEquals("Bearer ${sessionJwt(ACCOUNT_A)}", server.takeRequest().headers["Authorization"])
            assertTrue(seen.toString(), !seen.showsError())
            assertEquals(AccountUiState.LoggedOut, viewModel.state.value)
            assertEquals(0, store.signOutCalls)
        }

    private companion object {
        const val ACCOUNT_A = "6f1c3a52-9d0e-4c1b-8a77-2f4e5d6c7b8a"
        const val ACCOUNT_B = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b"
        const val NAME_A = "Zoila Ccahuana Ttito"
        const val PHONE_A = "+51911222333"
        const val WAIT_SECONDS = 5L
        const val UNAUTHORIZED =
            "{\"type\":\"about:blank\",\"title\":\"No autorizado\",\"status\":401,\"code\":\"unauthorized\"}"
        const val PROFILE_MISSING =
            "{\"type\":\"about:blank\",\"title\":\"No encontrado\",\"status\":404,\"code\":\"not_found\"," +
                "\"detail\":\"customer_profile_not_found\"}"
        const val NOT_FOUND =
            "{\"type\":\"about:blank\",\"title\":\"No encontrado\",\"status\":404,\"code\":\"not_found\"}"
    }
}
