package com.tindivo.customer.feature.signin

import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
import com.tindivo.customer.feature.profile.FakeProfileGateway
import com.tindivo.customer.feature.profile.GoogleNameHint
import com.tindivo.customer.feature.profile.PROFILE_MISSING
import com.tindivo.customer.feature.profile.TERMS_VERSION
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SignInResult
import com.tindivo.customer.session.sha256Hex
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SignInViewModelTest {
    private val store = FakeSessionStore(SessionState.SignedOut)
    private val profiles = FakeProfileGateway()
    private val dispatcher = UnconfinedTestDispatcher()
    private val hint = GoogleNameHint(store, CoroutineScope(dispatcher))
    private val configService =
        ConfigService(
            SystemRepository(
                "http://localhost.invalid/api/v1",
                createOkHttpClient(ClientInfo("customer", "0.1.0", "1")),
                dispatcher,
            ),
            "0.1.0",
            CoroutineScope(dispatcher),
        )
    private lateinit var viewModel: SignInViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        viewModel = SignInViewModel(store, profiles, hint, configService)
        viewModel.onTermsChecked(true)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `con un token de Google entra, y a Google se le dio el hash del nonce que recibe Auth`() =
        runTest {
            var hashGiven: String? = null

            viewModel.signIn { hashed ->
                hashGiven = hashed
                GoogleIdResult.Token("id-token-de-prueba")
            }

            assertEquals(SignInUiState.Done, viewModel.state.value)
            val (idToken, rawNonce) = store.signInCalls.single()
            assertEquals("id-token-de-prueba", idToken)
            assertEquals(sha256Hex(rawNonce), hashGiven)
        }

    @Test
    fun `CA-AUT-P1 sin la casilla marcada no se abre el selector y se avisa que falta`() =
        runTest {
            var opened = false
            val google =
                GoogleIdSource {
                    opened = true
                    GoogleIdResult.Cancelled
                }
            val vm = SignInViewModel(store, profiles, hint, configService)

            vm.signIn(google)
            assertEquals(SignInUiState.TermsMissing(1), vm.state.value)
            vm.signIn(google)
            assertEquals(SignInUiState.TermsMissing(2), vm.state.value)

            assertTrue(!opened)
            assertTrue(store.signInCalls.isEmpty())
        }

    @Test
    fun `CA-AUT-P1 al marcar la casilla se quita el aviso`() =
        runTest {
            val vm = SignInViewModel(store, profiles, hint, configService)
            vm.signIn { GoogleIdResult.Cancelled }

            vm.onTermsChecked(true)

            assertEquals(SignInUiState.Idle, vm.state.value)
            assertTrue(vm.termsChecked.value)
        }

    @Test
    fun `CA-AUT-P2 con la casilla marcada y el acceso completo se registra la aceptacion de la version vigente`() =
        runTest {
            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba") }

            assertEquals(SignInUiState.Done, viewModel.state.value)
            assertEquals("terms:$TERMS_VERSION:user-1", profiles.calls.first())
        }

    @Test
    fun `CA-AUT-03 si no se pudo guardar la aceptacion no se sigue y la sesion se cierra`() =
        runTest {
            profiles.termsResult = ApiResult.Failure(AppError.Known(ApiErrorCode.InternalError, 500, null))

            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba") }

            assertEquals(SignInUiState.TermsNotSaved, viewModel.state.value)
            assertEquals(listOf("user-1"), store.signOutIfCalls)
            assertEquals(listOf("terms:$TERMS_VERSION:user-1"), profiles.calls)
        }

    @Test
    fun `CA-AUT-03 si la pantalla se va a mitad del registro, la aceptacion termina y la sesion igual se cierra`() =
        runTest {
            profiles.termsResult = ApiResult.Failure(AppError.Known(ApiErrorCode.InternalError, 500, null))
            profiles.termsGate = CompletableDeferred()

            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba") }
            viewModel.viewModelScope.coroutineContext[Job]?.cancel()
            profiles.termsGate?.complete(Unit)

            assertEquals(listOf("user-1"), store.signOutIfCalls)
        }

    @Test
    fun `CA-AUT-03 un 426 al registrar la aceptacion lleva al flujo de actualizar la app`() =
        runTest {
            profiles.termsResult = ApiResult.Failure(AppError.UpgradeRequired("2.0.0"))

            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba") }

            assertEquals(SignInUiState.TermsNotSaved, viewModel.state.value)
            assertEquals(ConfigState.UpgradeRequired("2.0.0"), configService.state.value)
            assertEquals(listOf("user-1"), store.signOutIfCalls)
        }

    @Test
    fun `CA-AUT-13 entra con la aceptacion pendiente y solo la confirma despues de registrarla`() =
        runTest {
            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba") }

            assertEquals(listOf(true), store.signInTermsPending)
            assertEquals(listOf("user-1"), store.confirmTermsCalls)
            assertEquals(listOf("terms:$TERMS_VERSION:user-1", "load:user-1"), profiles.calls)
        }

    @Test
    fun `CA-AUT-13 si el registro falla la aceptacion no se confirma`() =
        runTest {
            profiles.termsResult = ApiResult.Failure(AppError.Known(ApiErrorCode.InternalError, 500, null))

            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba") }

            assertTrue(store.confirmTermsCalls.isEmpty())
            assertEquals(listOf("user-1"), store.signOutIfCalls)
        }

    @Test
    fun `CA-AUT-13 si no se puede confirmar la marca no se sigue y la sesion se cierra`() =
        runTest {
            store.confirmTermsResult = false

            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba") }

            assertEquals(SignInUiState.TermsNotSaved, viewModel.state.value)
            assertEquals(listOf("user-1"), store.signOutIfCalls)
        }

    @Test
    fun `si Auth falla queda en error`() =
        runTest {
            store.signInResult = SignInResult.Failed

            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba") }

            assertEquals(SignInUiState.Failed, viewModel.state.value)
        }

    @Test
    fun `si Google falla queda en error y no se llama a Auth`() =
        runTest {
            viewModel.signIn { GoogleIdResult.Failed }

            assertEquals(SignInUiState.Failed, viewModel.state.value)
            assertTrue(store.signInCalls.isEmpty())
        }

    @Test
    fun `si la persona cancela el selector no hay error ni llamada a Auth`() =
        runTest {
            viewModel.signIn { GoogleIdResult.Cancelled }

            assertEquals(SignInUiState.Idle, viewModel.state.value)
            assertTrue(store.signInCalls.isEmpty())
        }

    @Test
    fun `cada intento usa un nonce nuevo`() =
        runTest {
            viewModel.signIn { GoogleIdResult.Failed }
            val first = mutableListOf<String>()
            viewModel.signIn { hashed ->
                first += hashed
                GoogleIdResult.Cancelled
            }
            viewModel.signIn { hashed ->
                first += hashed
                GoogleIdResult.Cancelled
            }

            assertEquals(2, first.toSet().size)
        }

    @Test
    fun `una cuenta con perfil vuelve atras sin guardar el nombre de Google`() =
        runTest {
            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba", "Rosa Quispe") }

            assertEquals(SignInUiState.Done, viewModel.state.value)
            assertEquals(listOf("terms:$TERMS_VERSION:user-1", "load:user-1"), profiles.calls)
            assertNull(hint.take("user-1"))
        }

    @Test
    fun `una cuenta sin perfil pide completarlo y deja el nombre de Google como sugerencia de esa cuenta`() =
        runTest {
            profiles.loadResult = ApiResult.Failure(PROFILE_MISSING)

            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba", "Rosa Quispe") }

            assertEquals(SignInUiState.NeedsProfile, viewModel.state.value)
            assertEquals(listOf("terms:$TERMS_VERSION:user-1", "load:user-1"), profiles.calls)
            assertNull(hint.take("user-2"))
        }

    @Test
    fun `la sugerencia la recibe la cuenta que entro`() =
        runTest {
            profiles.loadResult = ApiResult.Failure(PROFILE_MISSING)

            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba", "Rosa Quispe") }

            assertEquals("Rosa Quispe", hint.take("user-1"))
        }

    @Test
    fun `otro 404 u otro error no pide completar el perfil`() =
        runTest {
            profiles.loadResult = ApiResult.Failure(AppError.Known(ApiErrorCode.NotFound, 404, "order_not_found"))
            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba", "Rosa Quispe") }
            assertEquals(SignInUiState.Done, viewModel.state.value)

            val again = SignInViewModel(store, profiles, hint, configService)
            again.onTermsChecked(true)
            profiles.loadResult = ApiResult.Failure(AppError.Known(ApiErrorCode.InternalError, 500, null))
            again.signIn { GoogleIdResult.Token("id-token-de-prueba", "Rosa Quispe") }

            assertEquals(SignInUiState.Done, again.state.value)
            assertNull(hint.take("user-1"))
        }

    @Test
    fun `si la cuenta cambia mientras se mira el perfil no pide completarlo ni guarda la sugerencia`() =
        runTest {
            profiles.loadResult = ApiResult.Failure(PROFILE_MISSING)
            profiles.loadGate = CompletableDeferred()

            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba", "Rosa Quispe") }
            store.switchTo("user-2")
            profiles.loadGate?.complete(Unit)

            assertEquals(SignInUiState.Done, viewModel.state.value)
            assertNull(hint.take("user-1"))
            assertNull(hint.take("user-2"))
        }
}
