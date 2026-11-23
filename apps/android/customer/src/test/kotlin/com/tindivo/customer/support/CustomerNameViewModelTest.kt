package com.tindivo.customer.support

import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.feature.checkout.SessionTokens
import com.tindivo.customer.feature.checkout.sessionJwt
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/** El nombre que firma la ayuda por WhatsApp sigue a la sesión: también si entra después de crearse el ViewModel. */
@OptIn(ExperimentalCoroutinesApi::class)
class CustomerNameViewModelTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    private fun customer(): CustomerRepository {
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                retry = RetryInterceptor(sleeper = { _, _ -> }),
                auth = BearerAuthInterceptor(server.url("/"), SessionTokens(token = sessionJwt("user-1"))),
            )
        return CustomerRepository(baseUrl, client, dispatcher)
    }

    private fun profile(name: String) =
        MockResponse
            .Builder()
            .code(200)
            .addHeader("Content-Type", "application/json")
            .body(
                "{\"data\":{\"fullName\":\"$name\",\"phone\":\"+51987654321\",\"phoneVerified\":true," +
                    "\"phoneVerifiedAt\":null,\"contraentregaBlocked\":false,\"blockedUntil\":null,\"blocked\":false}}",
            ).build()

    @Test
    fun `sin sesion no pide nada y el nombre queda vacio`() =
        runTest {
            val viewModel = CustomerNameViewModel(customer(), FakeSessionStore(SessionState.SignedOut))
            assertNull(viewModel.name.value)
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `si la sesion entra despues de crear el ViewModel el nombre llega`() =
        runTest {
            val store = FakeSessionStore(SessionState.SignedOut)
            val viewModel = CustomerNameViewModel(customer(), store)
            assertNull(viewModel.name.value)

            server.enqueue(profile("  María Quispe "))
            store.switchTo("user-1")

            assertEquals("María Quispe", viewModel.name.value)
        }

    @Test
    fun `al cerrar la sesion el nombre se borra`() =
        runTest {
            server.enqueue(profile("María Quispe"))
            val store = FakeSessionStore(SessionState.SignedIn("user-1"))
            val viewModel = CustomerNameViewModel(customer(), store)
            assertEquals("María Quispe", viewModel.name.value)

            store.switchToSignedOut()

            assertNull(viewModel.name.value)
        }
}
