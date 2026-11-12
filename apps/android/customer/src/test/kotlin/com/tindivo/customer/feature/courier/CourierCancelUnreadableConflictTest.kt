package com.tindivo.customer.feature.courier

import androidx.lifecycle.SavedStateHandle
import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CourierRepository
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.feature.checkout.SessionTokens
import com.tindivo.customer.feature.checkout.sessionJwt
import com.tindivo.customer.feature.orders.PollingDelay
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Clock
import java.util.UUID

/**
 * CAX-003 de la R2 de Entregas, con el cliente REAL en la cancelación (OkHttp + `RetryInterceptor` +
 * `BearerAuthInterceptor` + `CourierRepository` + [RepositoryCourierGateway] + MockWebServer): el servidor contesta al
 * `POST` de cancelar con un 409 cuyo cuerpo no es un `ProblemDetails` (HTML de un proxy, o vacío). La recarga del
 * seguimiento se retiene, así que en pantalla sigue el de antes («se puede cancelar»); volver a pedir cancelar no envía
 * otro `POST`.
 *
 * El seguimiento sale de [FakeCourierGateway] para poder retener la recarga (la compuerta); solo la cancelación va por
 * el cliente real.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CourierCancelUnreadableConflictTest : CourierHarness() {
    private val server = MockWebServer()

    @Before
    fun startServer() {
        server.start()
    }

    @After
    fun closeServer() {
        server.close()
    }

    private val real by lazy {
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                RetryInterceptor(sleeper = { _, _ -> }),
                auth = BearerAuthInterceptor(server.url("/"), SessionTokens(token = sessionJwt(ACCOUNT_A))),
            )
        RepositoryCourierGateway(
            CourierRepository(baseUrl, client, dispatcher),
            CustomerRepository(baseUrl, client, dispatcher),
            AddressRepository(baseUrl, client, dispatcher),
            CatalogRepository(baseUrl, client, dispatcher),
        )
    }

    /** El seguimiento del falso (con su compuerta) y la cancelación del cliente real. */
    private val mixed by lazy {
        object : CourierGateway by gateway {
            override suspend fun cancel(
                id: UUID,
                accountId: String,
            ): ApiResult<Unit> = real.cancel(id, accountId)
        }
    }

    private fun TestScope.watched(): CourierDetailViewModel {
        val viewModel =
            CourierDetailViewModel(
                SavedStateHandle(
                    mapOf("id" to COURIER_ID.toString(), "shortId" to "AB23CD45", "accountId" to ACCOUNT_A),
                ),
                mixed,
                session,
                config,
                PollingDelay { awaitCancellation() },
                Clock.systemUTC(),
            )
        backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
        return viewModel
    }

    private fun conflict(
        body: String,
        contentType: String,
    ) = server.enqueue(
        MockResponse
            .Builder()
            .code(409)
            .addHeader("Content-Type", contentType)
            .body(body)
            .build(),
    )

    private fun cancelPosts(): Int = server.requestCount

    private fun TestScope.assertSecondCancelIsNotSent() {
        gateway.trackings += ApiResult.Success(tracking("requested"))
        gateway.trackings += ApiResult.Success(tracking("accepted", driverName = "Luis"))
        val viewModel = watched()
        val reload = CompletableDeferred<Unit>()
        gateway.trackingGate = reload

        viewModel.askCancel()
        viewModel.confirmCancel()
        assertEquals("POST de cancelar", 1, cancelPosts())
        // La recarga sigue esperando: en pantalla, el seguimiento de antes («se puede cancelar»).
        assertTrue(
            (viewModel.state.value as CourierDetailUiState.Loaded)
                .tracking.phase
                .isCancellable(),
        )
        viewModel.askCancel()
        viewModel.confirmCancel()

        assertEquals("POST de cancelar", 1, cancelPosts())
        assertFalse(viewModel.cancel.value.confirming)
        assertTrue(viewModel.cancel.value.locked)
        assertEquals("POST", server.takeRequest().method)
        reload.complete(Unit)
    }

    @Test
    fun `un 409 con HTML al cancelar no deja volver a enviar la cancelacion`() =
        runTest {
            conflict("<html><body>409 Conflict</body></html>", "text/html")

            assertSecondCancelIsNotSent()
        }

    @Test
    fun `un 409 con el cuerpo vacio al cancelar no deja volver a enviar la cancelacion`() =
        runTest {
            conflict("", "application/problem+json")

            assertSecondCancelIsNotSent()
        }

    @Test
    fun `tras el gateway real un 409 ilegible es Unknown con su estado y sin detail`() =
        runTest {
            conflict("<html><body>409 Conflict</body></html>", "text/html")

            val error = (real.cancel(COURIER_ID, ACCOUNT_A) as ApiResult.Failure).error

            assertTrue("$error", error is AppError.Unknown)
            assertEquals(409, (error as AppError.Unknown).status)
            assertNull(error.detail)
        }
}
