package com.tindivo.customer.feature.account

import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AccountViewModelTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()
    private val store = FakeSessionStore()
    private lateinit var customer: CustomerRepository
    private lateinit var configService: ConfigService

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server.start()
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = RetryInterceptor(sleeper = { _, _ -> }))
        customer = CustomerRepository(baseUrl, client, dispatcher)
        configService =
            ConfigService(SystemRepository(baseUrl, client, dispatcher), "0.1.0", CoroutineScope(dispatcher))
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    private fun response(
        code: Int,
        body: String,
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", if (code == 200) "application/json" else "application/problem+json")
        .body(body)
        .build()

    private suspend fun AccountViewModel.settled(): AccountUiState = state.first { it !is AccountUiState.Loading }

    @Test
    fun `el telefono no sale en el toString del perfil ni del estado`() {
        val profile = AccountProfileUi("Rosa Quispe", phoneVerified = true, phone = "+51987654321")

        assertTrue(!profile.toString().contains("987654321"))
        assertTrue(!AccountUiState.Loaded(profile).toString().contains("987654321"))
    }

    @Test
    fun `muestra lo que dice el servidor, con telefono sin verificar`() =
        runTest {
            server.enqueue(response(200, profile(verified = false)))

            val state = AccountViewModel(customer, store, configService).settled()

            val expected = AccountProfileUi("Rosa Quispe", phoneVerified = false, phone = "+51987654321")
            assertEquals(AccountUiState.Loaded(expected), state)
        }

    @Test
    fun `muestra el telefono verificado`() =
        runTest {
            server.enqueue(response(200, profile(verified = true)))

            val state = AccountViewModel(customer, store, configService).settled()

            val expected = AccountProfileUi("Rosa Quispe", phoneVerified = true, phone = "+51987654321")
            assertEquals(AccountUiState.Loaded(expected), state)
        }

    @Test
    fun `un 401 del perfil cierra la sesion y pide volver al inicio`() =
        runTest {
            server.enqueue(response(401, UNAUTHORIZED))

            val state = AccountViewModel(customer, store, configService).settled()

            assertEquals(AccountUiState.LoggedOut, state)
            assertEquals(1, store.signOutCalls)
            assertEquals(SessionState.SignedOut, store.state.value)
        }

    @Test
    fun `otro error deja el fallo y permite reintentar`() =
        runTest {
            server.enqueue(response(403, FORBIDDEN))
            server.enqueue(response(200, profile(verified = true)))
            val viewModel = AccountViewModel(customer, store, configService)

            assertTrue(viewModel.settled() is AccountUiState.Failed)
            assertEquals(0, store.signOutCalls)
            viewModel.load()

            assertTrue(viewModel.settled() is AccountUiState.Loaded)
        }

    @Test
    fun `cerrar sesion llama al store y pide salir de la pantalla`() =
        runTest {
            server.enqueue(response(200, profile(verified = true)))
            val viewModel = AccountViewModel(customer, store, configService)
            viewModel.settled()

            viewModel.signOut()

            assertEquals(1, store.signOutCalls)
            assertEquals(AccountUiState.LoggedOut, viewModel.state.value)
        }

    @Test
    fun `si la sesion se cierra por otra via la pantalla pide salir`() =
        runTest {
            server.enqueue(response(200, profile(verified = true)))
            val viewModel = AccountViewModel(customer, store, configService)
            viewModel.settled()

            store.signOut()

            assertEquals(AccountUiState.LoggedOut, viewModel.state.value)
        }

    private fun profile(verified: Boolean) =
        "{\"data\":{\"fullName\":\"Rosa Quispe\",\"phone\":\"+51987654321\",\"phoneVerified\":$verified," +
            "\"phoneVerifiedAt\":null,\"contraentregaBlocked\":false,\"blockedUntil\":null,\"blocked\":false}}"

    private companion object {
        const val UNAUTHORIZED =
            "{\"type\":\"about:blank\",\"title\":\"No autorizado\",\"status\":401,\"code\":\"unauthorized\"}"
        const val FORBIDDEN =
            "{\"type\":\"about:blank\",\"title\":\"Prohibido\",\"status\":403,\"code\":\"forbidden\"}"
    }
}
