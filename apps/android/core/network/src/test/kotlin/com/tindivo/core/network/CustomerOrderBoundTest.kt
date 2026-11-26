package com.tindivo.core.network

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/** El detalle de un pedido atado a una cuenta (`GET /customer/orders/{id}` con [CustomerRepository.order]). */
@OptIn(ExperimentalCoroutinesApi::class)
class CustomerOrderBoundTest : HttpClientTestBase() {
    private val tokens = SwitchableTokens(token = testJwt(ACCOUNT))

    private fun customer() =
        CustomerRepository(
            baseUrl = server.url("/api/v1").toString().trimEnd('/'),
            client =
                createOkHttpClient(
                    info,
                    RetryInterceptor(sleeper = { _, _ -> }),
                    auth = BearerAuthInterceptor(server.url("/"), tokens),
                ),
            ioDispatcher = UnconfinedTestDispatcher(),
        )

    @Test
    fun `order de una cuenta con la sesion de otra no consulta nada`() =
        runTest {
            tokens.token = testJwt(OTHER_ACCOUNT)

            val error = (customer().order(ORDER_ID, ACCOUNT) as ApiResult.Failure).error

            assertTrue((error as AppError.Network).cause is AccountMismatchException)
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `order con la cuenta correcta sale con su token a la ruta del pedido`() =
        runTest {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(200)
                    .addHeader("Content-Type", "application/json")
                    .body(ORDER_DETAIL)
                    .build(),
            )

            val data = (customer().order(ORDER_ID, ACCOUNT) as ApiResult.Success).data

            assertEquals("48.50", data.total)
            val request = server.takeRequest()
            assertEquals("/api/v1/customer/orders/$ORDER_ID", request.url.encodedPath)
            assertEquals("Bearer ${testJwt(ACCOUNT)}", request.headers["Authorization"])
        }

    private companion object {
        const val ACCOUNT = "6f1c3a52-9d0e-4c1b-8a77-2f4e5d6c7b8a"
        const val OTHER_ACCOUNT = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b"

        val ORDER_ID: UUID = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01")

        const val ORDER_DETAIL = """
            {"data":{"id":"5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01","shortId":"ABCD2345","orderNumber":12,
             "status":"picked_up","deliveryMethod":"delivery","paymentIntent":"pending_cash","cancelReason":null,
             "businessId":"6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02","businessName":"Pollería Rosa","amount":"45.00",
             "deliveryFee":"3.50","total":"48.50","createdAt":"2026-10-26T15:00:00.000Z","deliveredAt":null,
             "items":[{"name":"Pollo","quantity":2,"lineTotal":"45.00","note":null,"modifiers":[]}],
             "customerNotes":null,"deliveryAddress":"Jr. Lima 123","deliveryReference":null,
             "deliveryCoordinates":null,"paysWith":null,"changeToGive":null,"estimatedReadyAt":null,
             "arrivedAtCustomerAt":null,"proofAttempt":0,"paymentVerifiedAt":null,"driver":null}}
        """
    }
}
