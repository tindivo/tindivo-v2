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
        // El autenticador real: el perfil sale atado a la cuenta de la pantalla (`boundTo`).
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                retry = RetryInterceptor(sleeper = { _, _ -> }),
                auth = BearerAuthInterceptor(server.url("/"), GatedTokens(sessionJwt("user-1"))),
            )
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
    fun `ni el nombre ni el telefono salen en el toString del perfil ni del estado`() {
        val profile = AccountProfileUi("Zoila Ccahuana Ttito", phoneVerified = true, phone = "+51987654321")

        for (text in listOf(profile.toString(), AccountUiState.Loaded(profile).toString())) {
            assertTrue(text, !text.contains("987654321"))
            assertTrue(text, !text.contains("Zoila"))
            assertTrue(text, !text.contains("Ccahuana"))
        }
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

    @Test
    fun `sin perfil no es un error, abre completar el perfil una sola vez y al volver con el perfil carga la cuenta`() =
        runTest {
            server.enqueue(response(404, PROFILE_MISSING))
            server.enqueue(response(404, PROFILE_MISSING))
            server.enqueue(response(200, profile(verified = false)))
            val viewModel = AccountViewModel(customer, store, configService)

            assertEquals(AccountUiState.ProfileMissing(openNow = true), viewModel.settled())
            viewModel.onProfilePromptOpened()
            assertEquals(AccountUiState.ProfileMissing(openNow = false), viewModel.state.value)

            // Volvió sin completarlo: se queda el botón, la pantalla no se vuelve a abrir sola.
            viewModel.load()
            assertEquals(AccountUiState.ProfileMissing(openNow = false), viewModel.settled())

            viewModel.load()
            assertTrue(viewModel.settled() is AccountUiState.Loaded)
            assertEquals(0, store.signOutCalls)
        }

    @Test
    fun `otro 404 sigue siendo un fallo`() =
        runTest {
            server.enqueue(response(404, NOT_FOUND))

            val state = AccountViewModel(customer, store, configService).settled()

            assertTrue(state is AccountUiState.Failed)
        }

    private fun profile(verified: Boolean) =
        "{\"data\":{\"fullName\":\"Rosa Quispe\",\"phone\":\"+51987654321\",\"phoneVerified\":$verified," +
            "\"phoneVerifiedAt\":null,\"contraentregaBlocked\":false,\"blockedUntil\":null,\"blocked\":false}}"

    private companion object {
        const val UNAUTHORIZED =
            "{\"type\":\"about:blank\",\"title\":\"No autorizado\",\"status\":401,\"code\":\"unauthorized\"}"
        const val PROFILE_MISSING =
            "{\"type\":\"about:blank\",\"title\":\"No encontrado\",\"status\":404,\"code\":\"not_found\"," +
                "\"detail\":\"customer_profile_not_found\"}"
        const val NOT_FOUND =
            "{\"type\":\"about:blank\",\"title\":\"No encontrado\",\"status\":404,\"code\":\"not_found\"}"
        const val FORBIDDEN =
            "{\"type\":\"about:blank\",\"title\":\"Prohibido\",\"status\":403,\"code\":\"forbidden\"}"
    }
}
