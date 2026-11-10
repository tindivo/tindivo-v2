package com.tindivo.core.network

import com.tindivo.core.network.generated.model.CreateCourierOrderRequest
import com.tindivo.core.network.generated.model.CreateCourierOrderRequestOrigin
import com.tindivo.core.network.generated.model.CreateOrderRequestCoordinates
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class CourierRepositoryTest : HttpClientTestBase() {
    private val tokens = SwitchableTokens(token = testJwt(ACCOUNT))

    private fun courier() =
        CourierRepository(
            baseUrl = server.url("/api/v1").toString().trimEnd('/'),
            client =
                createOkHttpClient(
                    info,
                    RetryInterceptor(sleeper = { _, _ -> }),
                    auth = BearerAuthInterceptor(server.url("/"), tokens),
                ),
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
        detail: String,
    ) = json(
        status,
        """{"type":"about:blank","title":"x","status":$status,"code":"$code","detail":"$detail"}""",
        "application/problem+json",
    )

    private fun endpoint(reference: String) =
        CreateCourierOrderRequestOrigin(
            contactName = "Quien entrega",
            coordinates = CreateOrderRequestCoordinates(BigDecimal("-9.1234567"), BigDecimal("-78.1234567")),
            referenceText = reference,
            contactPhone = "987654321",
        )

    private fun request() =
        CreateCourierOrderRequest(
            origin = endpoint("Botica Santa Rosa"),
            destination = endpoint("Casa verde frente al parque"),
            requesterName = "Rosa",
            requesterPhone = "987654321",
            itemDescription = "Documentos",
            isFragile = false,
            readyInMin = 0,
            payer = CreateCourierOrderRequest.Payer.destination,
            weightConfirmed = true,
            prepaidConfirmed = true,
        )

    @Test
    fun `status lee el precio como decimal exacto y el horario`() =
        runTest {
            server.enqueue(
                json(
                    200,
                    """{"enabled":true,"openNow":false,"hours":{"start":"18:00","end":"23:00"},""" +
                        """"price":3.5,"pausedMessage":null}""",
                ),
            )

            val data = (courier().status() as ApiResult.Success).data

            assertEquals(0, BigDecimal("3.5").compareTo(data.price))
            assertFalse(data.openNow)
            assertEquals("18:00", data.hours?.start)
            assertEquals("/api/v1/public/courier/status", server.takeRequest().url.encodedPath)
        }

    @Test
    fun `create manda la clave en la cabecera y las coordenadas como numero JSON`() =
        runTest {
            server.enqueue(json(201, CREATED))
            val key = UUID.fromString("11111111-2222-4333-8444-555555555555")

            val data = (courier().create(request(), key, ACCOUNT) as ApiResult.Success).data

            assertEquals("AB23CD45", data.shortId)
            assertEquals(0, BigDecimal("3.00").compareTo(data.feeAmount))
            val sent = server.takeRequest()
            assertEquals("POST", sent.method)
            assertEquals("/api/v1/customer/courier-orders", sent.url.encodedPath)
            assertEquals(key.toString(), sent.headers["Idempotency-Key"])
            val body = checkNotNull(sent.body).utf8()
            assertTrue(body, body.contains(""""lat":-9.1234567"""))
            assertTrue(body, body.contains(""""payer":"destination""""))
            assertTrue(body, body.contains(""""weightConfirmed":true"""))
            // Lo que es null no viaja: el contrato rechaza `driverNote: null` con 422.
            assertFalse(body, body.contains("driverNote"))
        }

    @Test
    fun `create con 409 courier_closed devuelve el detalle del servidor`() =
        runTest {
            server.enqueue(problem(409, "conflict", "Atendemos de 6 a 11 pm, todos los días."))

            val error = (courier().create(request(), UUID.randomUUID(), ACCOUNT) as ApiResult.Failure).error

            val known = error as AppError.Known
            assertEquals(ApiErrorCode.Conflict, known.code)
            assertEquals("Atendemos de 6 a 11 pm, todos los días.", known.detail)
        }

    @Test
    fun `create con el token de otra cuenta no sale`() =
        runTest {
            tokens.token = testJwt("otra-cuenta")

            val error = (courier().create(request(), UUID.randomUUID(), ACCOUNT) as ApiResult.Failure).error

            assertTrue((error as AppError.Network).cause is AccountMismatchException)
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `list pide la pagina y lee la tarifa como texto`() =
        runTest {
            server.enqueue(json(200, LIST))

            val data = (courier().list(null, ACCOUNT) as ApiResult.Success).data

            assertEquals("3.00", data.items.single().feeAmount)
            assertNull(data.nextCursor)
            assertEquals("Mamá", data.frequentContacts.single().name)
            val sent = server.takeRequest()
            assertEquals("/api/v1/customer/courier-orders", sent.url.encodedPath)
            assertEquals("20", sent.url.queryParameter("limit"))
        }

    @Test
    fun `tracking pide el codigo corto`() =
        runTest {
            server.enqueue(json(200, TRACKING))

            val data = (courier().tracking("AB23CD45", ACCOUNT) as ApiResult.Success).data

            assertEquals("requested", data.status)
            assertEquals("2026-11-10T23:15:00Z", data.acceptDeadline)
            assertEquals("/api/v1/public/courier/AB23CD45", server.takeRequest().url.encodedPath)
        }

    @Test
    fun `cancel manda POST a la entrega y un 409 llega como conflicto`() =
        runTest {
            server.enqueue(problem(409, "conflict", "Esta entrega ya no se puede cancelar."))

            val error = (courier().cancel(ORDER_ID, ACCOUNT) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.Conflict, (error as AppError.Known).code)
            val sent = server.takeRequest()
            assertEquals("POST", sent.method)
            assertEquals("/api/v1/customer/courier-orders/$ORDER_ID/cancel", sent.url.encodedPath)
        }

    private companion object {
        const val ACCOUNT = "4f8b1c2e-0000-4000-8000-000000000001"
        val ORDER_ID: UUID = UUID.fromString("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")

        const val CREATED =
            """{"data":{"id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","shortId":"AB23CD45","orderNumber":7,""" +
                """"status":"requested","feeAmount":3.00,"distanceM":812.4}}"""

        const val POINT =
            """{"name":"Mamá","phone":"987654321","coordinates":{"lat":-9.1,"lng":-78.1},""" +
                """"referenceText":"Casa verde frente al parque"}"""

        const val LIST =
            """{"data":{"items":[{"id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","shortId":"AB23CD45",""" +
                """"orderNumber":7,"status":"requested","cancelReason":null,"origin":$POINT,"destination":$POINT,""" +
                """"itemDescription":"Documentos","isFragile":false,"payer":"destination","driverName":null,""" +
                """"feeAmount":"3.00","createdAt":"2026-11-10T23:00:00Z","deliveredAt":null}],""" +
                """"nextCursor":null,"frequentContacts":[{"name":"Mamá","phone":"987654321",""" +
                """"coordinates":{"lat":-9.1,"lng":-78.1},"referenceText":"Casa verde frente al parque",""" +
                """"timesUsed":3,"lastUsedAt":"2026-11-10T23:00:00Z"}]}}"""

        const val TRACKING =
            """{"shortId":"AB23CD45","orderNumber":7,"status":"requested","originName":"Botica",""" +
                """"destinationName":"Mamá","originCoordinates":{"lat":-9.1,"lng":-78.1},""" +
                """"destinationCoordinates":{"lat":-9.2,"lng":-78.2},"itemDescription":"Documentos",""" +
                """"feeAmount":3,"payer":"destination","readyAt":"2026-11-10T23:00:00Z","driverName":null,""" +
                """"createdAt":"2026-11-10T23:00:00Z","acceptedAt":null,"pickedUpAt":null,"deliveredAt":null,""" +
                """"cancelledAt":null,"cancelReason":null,"acceptMinutes":15,""" +
                """"acceptDeadline":"2026-11-10T23:15:00Z"}"""
    }
}
