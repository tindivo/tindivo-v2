package com.tindivo.customer.feature.courier

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
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * EVID-001 de la R1 de Entregas: la tarifa del seguimiento (`feeAmount`, un `number` heredado) con el cliente REAL
 * (OkHttp + el `Json` del cliente generado + MockWebServer) y el `CourierGateway` de producción. Un importe ilegible
 * se rechaza al leerlo (texto, `NaN`, vacío) o al mostrarlo (negativo, tres decimales): la pantalla recibe un error y
 * nunca un importe redondeado. El exacto sale tal cual.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CourierMoneyDecodeTest {
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
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                RetryInterceptor(sleeper = { _, _ -> }),
                auth = BearerAuthInterceptor(server.url("/"), SessionTokens(token = sessionJwt(ACCOUNT))),
            )
        RepositoryCourierGateway(
            CourierRepository(baseUrl, client, dispatcher),
            CustomerRepository(baseUrl, client, dispatcher),
            AddressRepository(baseUrl, client, dispatcher),
            CatalogRepository(baseUrl, client, dispatcher),
        )
    }

    private suspend fun trackingWithFee(fee: String): ApiResult<CourierTrackingUi> {
        server.enqueue(
            MockResponse
                .Builder()
                .code(200)
                .addHeader("Content-Type", "application/json")
                .body(
                    """{"shortId":"AB23CD45","orderNumber":7,"status":"requested","originName":"Botica",""" +
                        """"destinationName":"Casa","originCoordinates":{"lat":-9.1,"lng":-78.1},""" +
                        """"destinationCoordinates":{"lat":-9.2,"lng":-78.2},"itemDescription":"Sobre",""" +
                        """"feeAmount":$fee,"payer":"destination","readyAt":"2026-11-10T23:00:00Z",""" +
                        """"driverName":null,"createdAt":"2026-11-10T23:00:00Z","acceptedAt":null,""" +
                        """"pickedUpAt":null,"deliveredAt":null,"cancelledAt":null,"cancelReason":null,""" +
                        """"acceptMinutes":15,"acceptDeadline":"2026-11-10T23:15:00Z"}""",
                ).build(),
        )
        return gateway.tracking("AB23CD45", ACCOUNT)
    }

    @Test
    fun `una tarifa ilegible al leerla o al mostrarla es un error, nunca un importe redondeado`() =
        runTest {
            for (fee in listOf("\"abc\"", "\"NaN\"", "\"\"", "-1.00", "1.005")) {
                val result = trackingWithFee(fee)
                assertTrue(fee, result is ApiResult.Failure && result.error is AppError.Unknown)
            }
        }

    @Test
    fun `una tarifa exacta se muestra tal cual con dos decimales`() =
        runTest {
            val shown = (trackingWithFee("3.5") as ApiResult.Success).data

            assertEquals("S/ 3.50", shown.feeText.replace(' ', ' '))
        }

    private companion object {
        const val ACCOUNT = "4f8b1c2e-0000-4000-8000-0000000000cc"
    }
}
