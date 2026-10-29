package com.tindivo.core.network

import com.tindivo.core.network.generated.model.CreateOrderRequest
import com.tindivo.core.network.generated.model.CreateOrderRequestCoordinates
import com.tindivo.core.network.generated.model.CreateOrderRequestItemsInner
import com.tindivo.core.network.generated.model.QuoteCheckoutRequest
import com.tindivo.core.network.generated.model.QuoteCheckoutRequestItemsInner
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutRepositoryTest : HttpClientTestBase() {
    private fun checkout() =
        CheckoutRepository(
            baseUrl = server.url("/api/v1").toString().trimEnd('/'),
            client = realClient(),
            ioDispatcher = UnconfinedTestDispatcher(),
        )

    private fun json(
        code: Int,
        body: String,
        contentType: String = "application/json",
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", contentType)
        .body(body)
        .build()

    private fun problem(
        status: Int,
        code: String,
    ) = json(
        status,
        """{"type":"about:blank","title":"x","status":$status,"code":"$code"}""",
        "application/problem+json",
    )

    private fun orderRequest(cashPayingWith: BigDecimal? = null) =
        CreateOrderRequest(
            businessId = BUSINESS_ID,
            deliveryMethod = CreateOrderRequest.DeliveryMethod.delivery,
            paymentIntent = CreateOrderRequest.PaymentIntent.pending_cash,
            customerName = "Rosa Quispe",
            customerPhone = "+51987654321",
            items = listOf(CreateOrderRequestItemsInner(menuItemId = ITEM_ID, quantity = 2)),
            deliveryAddress = "Jr. Lima 123",
            coordinates =
                CreateOrderRequestCoordinates(
                    lat = BigDecimal("-9.3333333"),
                    lng = BigDecimal("-77.5000000"),
                ),
            cashPayingWith = cashPayingWith,
        )

    @Test
    fun `quote manda POST con el cuerpo y decodifica los importes como texto`() =
        runTest {
            server.enqueue(json(200, QUOTE))
            val request =
                QuoteCheckoutRequest(
                    businessId = BUSINESS_ID,
                    deliveryMethod = QuoteCheckoutRequest.DeliveryMethod.delivery,
                    items = listOf(QuoteCheckoutRequestItemsInner(menuItemId = ITEM_ID, quantity = 2)),
                )

            val data = (checkout().quote(request) as ApiResult.Success).data

            assertEquals("48.50", data.total)
            assertEquals("3.50", data.deliveryFee)
            assertEquals("50.00", data.maxChange)
            val sent = server.takeRequest()
            assertEquals("POST", sent.method)
            assertEquals("/api/v1/customer/checkout/quote", sent.url.encodedPath)
            assertEquals("android", sent.headers["X-Tindivo-Platform"])
            assertTrue(checkNotNull(sent.body).utf8().contains(""""quantity":2"""))
        }

    @Test
    fun `quote con 404 devuelve NotFound`() =
        runTest {
            server.enqueue(problem(404, "not_found"))

            val error =
                (
                    checkout().quote(
                        QuoteCheckoutRequest(BUSINESS_ID, QuoteCheckoutRequest.DeliveryMethod.pickup, emptyList()),
                    ) as ApiResult.Failure
                ).error

            assertEquals(ApiErrorCode.NotFound, (error as AppError.Known).code)
        }

    @Test
    fun `paymentOptions manda GET y decodifica la respuesta`() =
        runTest {
            server.enqueue(
                json(200, """{"data":{"contraentregaAllowed":false,"prepayRequired":true,"reason":"first_order"}}"""),
            )

            val data = (checkout().paymentOptions() as ApiResult.Success).data

            assertFalse(data.contraentregaAllowed)
            assertTrue(data.prepayRequired)
            val sent = server.takeRequest()
            assertEquals("GET", sent.method)
            assertEquals("/api/v1/customer/payment-options", sent.url.encodedPath)
        }

    @Test
    fun `paymentOptions con 401 devuelve Unauthorized`() =
        runTest {
            server.enqueue(problem(401, "unauthorized"))

            val error = (checkout().paymentOptions() as ApiResult.Failure).error

            assertEquals(ApiErrorCode.Unauthorized, (error as AppError.Known).code)
        }

    @Test
    fun `createOrder manda POST con la Idempotency-Key y devuelve el pedido creado`() =
        runTest {
            server.enqueue(json(201, CREATED))

            val data = (checkout().createOrder(orderRequest(), KEY) as ApiResult.Success).data

            assertEquals("ABCD2345", data.shortId)
            assertEquals(BigDecimal("48.50"), data.total)
            val sent = server.takeRequest()
            assertEquals("POST", sent.method)
            assertEquals("/api/v1/customer/orders", sent.url.encodedPath)
            assertEquals(KEY.toString(), sent.headers["Idempotency-Key"])
            assertEquals("android", sent.headers["X-Tindivo-Platform"])
        }

    @Test
    fun `createOrder manda cashPayingWith y las coordenadas como numeros JSON exactos, no como texto`() =
        runTest {
            server.enqueue(json(201, CREATED))

            checkout().createOrder(orderRequest(cashPayingWith = BigDecimal("50.00")), KEY)

            val body = checkNotNull(server.takeRequest().body).utf8()
            assertTrue(body, body.contains(""""cashPayingWith":50.00"""))
            assertTrue(body, body.contains(""""lat":-9.3333333"""))
            assertTrue(body, body.contains(""""lng":-77.5000000"""))
        }

    @Test
    fun `createOrder con 409 idempotency_conflict devuelve el codigo`() =
        runTest {
            server.enqueue(problem(409, "idempotency_conflict"))

            val error = (checkout().createOrder(orderRequest(), KEY) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.IdempotencyConflict, (error as AppError.Known).code)
            assertEquals(409, error.status)
        }

    @Test
    fun `createOrder con problem+json 422 devuelve Known con el detalle`() =
        runTest {
            server.enqueue(
                json(
                    422,
                    """{"type":"about:blank","title":"x","status":422,"code":"validation_error","detail":"Falta el teléfono"}""",
                    "application/problem+json",
                ),
            )

            val error = (checkout().createOrder(orderRequest(), KEY) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.ValidationError, (error as AppError.Known).code)
            assertEquals("Falta el teléfono", error.detail)
        }

    @Test
    fun `createOrder con Idempotency-Key se reintenta ante un 503 con la misma clave`() =
        runTest {
            server.enqueue(problem(503, "internal_error"))
            server.enqueue(json(201, CREATED))

            val result = checkout().createOrder(orderRequest(), KEY)

            assertTrue(result is ApiResult.Success)
            assertEquals(2, server.requestCount)
            assertEquals(KEY.toString(), server.takeRequest().headers["Idempotency-Key"])
            assertEquals(KEY.toString(), server.takeRequest().headers["Idempotency-Key"])
        }

    @Test
    fun `quote es un POST sin Idempotency-Key y un 503 NO se reintenta`() =
        runTest {
            server.enqueue(problem(503, "internal_error"))
            server.enqueue(json(200, QUOTE))

            val result =
                checkout().quote(
                    QuoteCheckoutRequest(BUSINESS_ID, QuoteCheckoutRequest.DeliveryMethod.pickup, emptyList()),
                )

            assertTrue(result is ApiResult.Failure)
            assertEquals(1, server.requestCount)
            assertEquals(null, server.takeRequest().headers["Idempotency-Key"])
        }

    private companion object {
        val BUSINESS_ID: UUID = UUID.fromString("6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02")
        val ITEM_ID: UUID = UUID.fromString("7c2a737a-018f-4c2d-9a11-6f0d3c1e8a03")
        val KEY: UUID = UUID.fromString("8d2a737a-018f-4c2d-9a11-6f0d3c1e8a04")

        const val QUOTE = """
            {"data":{"businessId":"6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02","deliveryMethod":"delivery",
             "items":[{"menuItemId":"7c2a737a-018f-4c2d-9a11-6f0d3c1e8a03","name":"Pollo","quantity":2,
              "unitPrice":"22.50","lineTotal":"45.00"}],
             "subtotal":"45.00","deliveryBand":"near","nominalDeliveryFee":"3.50","deliveryFee":"3.50",
             "freeDelivery":{"applies":false,"reason":null},"total":"48.50","maxChange":"50.00",
             "prepayThreshold":"60.00","exceedsPrepayThreshold":false}}
        """

        const val CREATED = """
            {"data":{"id":"5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01","shortId":"ABCD2345","orderNumber":12,
             "status":"pending_acceptance","orderAmount":45.00,"deliveryFee":3.50,"total":48.50,
             "promoApplied":false,"pickupTiming":null}}
        """
    }
}
