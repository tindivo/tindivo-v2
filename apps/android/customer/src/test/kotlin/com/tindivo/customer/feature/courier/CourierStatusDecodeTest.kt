package com.tindivo.customer.feature.courier

import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CourierRepository
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.createOkHttpClient
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/**
 * CA-ENT-11: el peso máximo sale del servidor (`maxWeightKg` de `GET /public/courier/status`), con el cliente REAL y
 * el `CourierGateway` de producción. Un servidor anterior que no lo manda no rompe nada y la app no escribe un peso.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CourierStatusDecodeTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun startServer() {
        server.start()
    }

    @After
    fun closeServer() {
        server.close()
    }

    private val gateway by lazy {
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client = createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), RetryInterceptor(sleeper = { _, _ -> }))
        RepositoryCourierGateway(
            CourierRepository(baseUrl, client, dispatcher),
            CustomerRepository(baseUrl, client, dispatcher),
            AddressRepository(baseUrl, client, dispatcher),
            CatalogRepository(baseUrl, client, dispatcher),
        )
    }

    private suspend fun status(extra: String): CourierServiceUi {
        server.enqueue(
            MockResponse
                .Builder()
                .code(200)
                .addHeader("Content-Type", "application/json")
                .body(
                    """{"enabled":true,"openNow":true,"hours":{"start":"18:00","end":"23:00"},"price":3,""" +
                        """"pausedMessage":null$extra}""",
                ).build(),
        )
        return (gateway.status() as ApiResult.Success).data
    }

    @Test
    fun `CA-ENT-11 · el peso del servidor llega tal cual, sin ceros de sobra`() =
        runTest {
            assertEquals("5", status(""","maxWeightKg":5""").maxWeightKg)
            assertEquals("7.5", status(""","maxWeightKg":7.50""").maxWeightKg)
        }

    @Test
    fun `CA-ENT-11 · un peso en cero o negativo no se muestra`() =
        runTest {
            assertNull(status(""","maxWeightKg":0""").maxWeightKg)
            assertNull(status(""","maxWeightKg":-2""").maxWeightKg)
        }

    @Test
    fun `CA-ENT-11 · sin el campo la app no escribe un peso y el servicio se lee igual`() =
        runTest {
            val service = status("")
            assertNull(service.maxWeightKg)
            assertEquals("S/ 3.00", service.priceText.replace(' ', ' '))
        }
}
