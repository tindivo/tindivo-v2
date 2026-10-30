package com.tindivo.customer.feature.signin

import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SignInResult
import com.tindivo.customer.session.sha256Hex
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SignInViewModelTest {
    private val store = FakeSessionStore(SessionState.SignedOut)
    private lateinit var viewModel: SignInViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        viewModel = SignInViewModel(store)
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
}
