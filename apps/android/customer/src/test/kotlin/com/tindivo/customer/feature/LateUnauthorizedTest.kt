package com.tindivo.customer.feature

import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.PhoneRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.account.AccountUiState
import com.tindivo.customer.feature.account.AccountViewModel
import com.tindivo.customer.feature.addresses.AddressFormViewModel
import com.tindivo.customer.feature.addresses.FormOutcome
import com.tindivo.customer.feature.checkout.sessionJwt
import com.tindivo.customer.feature.phone.PhoneUiState
import com.tindivo.customer.feature.phone.PhoneVerifyViewModel
import com.tindivo.customer.feature.profile.FakeProfileGateway
import com.tindivo.customer.feature.profile.GoogleNameHint
import com.tindivo.customer.feature.profile.ProfileOutcome
import com.tindivo.customer.feature.profile.ProfileViewModel
import com.tindivo.customer.push.NoPushSignOut
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.GatedTokens
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * CAX-002: el 401 definitivo de una llamada de la cuenta A llega cuando la sesión del aparato ya es B, y su continuación
 * corre ANTES que el colector de sesión del ViewModel (que aún no vio el cambio). Ese 401 no puede cerrar la sesión de B,
 * y la pantalla de A no publica nada de A: termina cerrada.
 *
 * El hilo principal es un [StandardTestDispatcher]: nada corre hasta `runCurrent()`. Las llamadas van por un único hilo
 * de verdad; [drain] espera a que termine la que está en él, así su continuación queda en la cola del principal antes
 * que la del colector, que entra al cambiar de cuenta.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class LateUnauthorizedTest {
    private val main = StandardTestDispatcher()
    private val server = MockWebServer()
    private val store = FakeSessionStore(SessionState.SignedIn(ACCOUNT_A))
    private val tokens = GatedTokens(sessionJwt(ACCOUNT_A))
    private val executor = Executors.newSingleThreadExecutor()
    private val io = executor.asCoroutineDispatcher()
    private lateinit var baseUrl: String
    private lateinit var configService: ConfigService

    @Before
    fun setUp() {
        Dispatchers.setMain(main)
        server.start()
        baseUrl = server.url("/api/v1").toString().trimEnd('/')
        configService = ConfigService(SystemRepository(baseUrl, client(), io), "0.1.0", CoroutineScope(main))
    }

    @After
    fun tearDown() {
        server.close()
        executor.shutdownNow()
        Dispatchers.resetMain()
    }

    private fun client() =
        createOkHttpClient(
            ClientInfo("customer", "0.1.0", "1"),
            retry = RetryInterceptor(sleeper = { _, _ -> }),
            auth = BearerAuthInterceptor(server.url("/"), tokens),
        )

    private fun problem(status: Int) =
        MockResponse
            .Builder()
            .code(status)
            .addHeader("Content-Type", "application/problem+json")
            .body("""{"type":"about:blank","title":"x","status":$status,"code":"${codeOf(status)}"}""")
            .build()

    private fun codeOf(status: Int) = if (status == HTTP_UNAUTHORIZED) "unauthorized" else "not_found"

    /** Espera a que el hilo de las llamadas termine lo que tenía: su respuesta ya está en la cola del principal. */
    private fun drain() {
        executor.submit {}.get(WAIT_SECONDS, TimeUnit.SECONDS)
    }

    /** La respuesta (401) de A ya espera en la cola; recién ahora la sesión pasa a B, y luego corre todo. */
    private fun TestScope.switchToBAfterTheResponse() {
        drain()
        store.switchTo(ACCOUNT_B)
        runCurrent()
    }

    private fun assertBStillSignedIn() {
        assertEquals(SessionState.SignedIn(ACCOUNT_B), store.state.value)
        assertEquals(0, store.signOutCalls)
    }

    @Test
    fun `un 401 tardio del celular de A no cierra la sesion de B`() =
        runTest(main) {
            val clock = Clock.fixed(Instant.parse("2026-10-30T15:00:00Z"), ZoneOffset.UTC)
            val viewModel = PhoneVerifyViewModel(PhoneRepository(baseUrl, client(), io), store, configService, clock)
            runCurrent()
            server.enqueue(problem(HTTP_UNAUTHORIZED))
            viewModel.onPhoneChanged("987654321")
            viewModel.sendCode()
            runCurrent()

            switchToBAfterTheResponse()

            assertBStillSignedIn()
            assertEquals(listOf(ACCOUNT_A), store.signOutIfCalls)
            assertEquals(PhoneUiState(loggedOut = true), viewModel.state.value)
        }

    @Test
    fun `un 401 tardio de la direccion de A no cierra la sesion de B`() =
        runTest(main) {
            // La configuración pública (sin sesión) no responde y se usa la zona de respaldo; luego la lista da 401.
            server.enqueue(problem(HTTP_NOT_FOUND))
            server.enqueue(problem(HTTP_UNAUTHORIZED))
            val viewModel =
                AddressFormViewModel(
                    null,
                    AddressRepository(baseUrl, client(), io),
                    CatalogRepository(baseUrl, client(), io),
                    store,
                    configService,
                )
            runCurrent()
            drain()
            runCurrent()

            switchToBAfterTheResponse()

            assertBStillSignedIn()
            assertEquals(listOf(ACCOUNT_A), store.signOutIfCalls)
            assertEquals(FormOutcome.LoggedOut, viewModel.state.value.outcome)
        }

    @Test
    fun `un 401 tardio de Mi cuenta de A no cierra la sesion de B`() =
        runTest(main) {
            server.enqueue(problem(HTTP_UNAUTHORIZED))
            val viewModel =
                AccountViewModel(CustomerRepository(baseUrl, client(), io), store, configService, NoPushSignOut)
            runCurrent()

            switchToBAfterTheResponse()

            assertBStillSignedIn()
            // CAX-003: antes de mirar el error, la pantalla ve que la sesión ya es de otra cuenta y termina; ni siquiera
            // pide cerrar la de A.
            assertEquals(emptyList<String>(), store.signOutIfCalls)
            assertEquals(AccountUiState.LoggedOut, viewModel.state.value)
        }

    @Test
    fun `un 401 tardio del perfil de A no cierra la sesion de B`() =
        runTest(main) {
            val gateway =
                FakeProfileGateway().apply {
                    termsResult = ApiResult.Failure(AppError.Known(ApiErrorCode.Unauthorized, HTTP_UNAUTHORIZED, null))
                    termsGate = CompletableDeferred()
                }
            val viewModel = ProfileViewModel(gateway, store, configService, GoogleNameHint(store, CoroutineScope(main)))
            runCurrent()
            viewModel.onName("Rosa Quispe")
            viewModel.save()
            runCurrent()

            // El 401 de A sale de la compuerta (su continuación queda en cola) y recién entonces entra B.
            checkNotNull(gateway.termsGate).complete(Unit)
            store.switchTo(ACCOUNT_B)
            runCurrent()

            assertBStillSignedIn()
            assertEquals(ProfileOutcome.Left, viewModel.state.value.outcome)
        }

    private companion object {
        const val ACCOUNT_A = "6f1c3a52-9d0e-4c1b-8a77-2f4e5d6c7b8a"
        const val ACCOUNT_B = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b"
        const val HTTP_UNAUTHORIZED = 401
        const val HTTP_NOT_FOUND = 404
        const val WAIT_SECONDS = 5L
    }
}
