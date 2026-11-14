package com.tindivo.customer.feature.signin

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.feature.profile.FakeProfileGateway
import com.tindivo.customer.feature.profile.GoogleNameHint
import com.tindivo.customer.feature.profile.PROFILE_MISSING
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SignInResult
import com.tindivo.customer.session.sha256Hex
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
    private lateinit var viewModel: SignInViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        viewModel = SignInViewModel(store, profiles, hint)
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
            assertEquals(listOf("load:user-1"), profiles.calls)
            assertNull(hint.take("user-1"))
        }

    @Test
    fun `una cuenta sin perfil pide completarlo y deja el nombre de Google como sugerencia de esa cuenta`() =
        runTest {
            profiles.loadResult = ApiResult.Failure(PROFILE_MISSING)

            viewModel.signIn { GoogleIdResult.Token("id-token-de-prueba", "Rosa Quispe") }

            assertEquals(SignInUiState.NeedsProfile, viewModel.state.value)
            assertEquals(listOf("load:user-1"), profiles.calls)
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

            val again = SignInViewModel(store, profiles, hint)
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
