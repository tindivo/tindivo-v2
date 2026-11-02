package com.tindivo.core.network

import com.tindivo.core.network.generated.model.CreateCustomerAddressRequest
import com.tindivo.core.network.generated.model.UpdateCustomerAddressRequest
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class AddressRepositoryTest : HttpClientTestBase() {
    private val tokens = SwitchableTokens(token = testJwt(ACCOUNT))

    private fun addresses() =
        AddressRepository(
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
    ) = json(
        status,
        """{"type":"about:blank","title":"x","status":$status,"code":"$code"}""",
        "application/problem+json",
    )

    @Test
    fun `list manda GET y decodifica las direcciones`() =
        runTest {
            server.enqueue(json(200, """{"data":{"items":[$ADDRESS]}}"""))

            val items = (addresses().list(ACCOUNT) as ApiResult.Success).data.items

            assertEquals(1, items.size)
            assertEquals("Casa", items[0].label)
            assertEquals("Frente al parque", items[0].reference)
            val sent = server.takeRequest()
            assertEquals("GET", sent.method)
            assertEquals("/api/v1/customer/addresses", sent.url.encodedPath)
            assertEquals("android", sent.headers["X-Tindivo-Platform"])
        }

    @Test
    fun `create manda POST con el cuerpo y devuelve la direccion creada`() =
        runTest {
            server.enqueue(json(201, """{"data":$ADDRESS}"""))

            val created =
                (
                    addresses().create(
                        CreateCustomerAddressRequest(reference = "Frente al parque"),
                        ACCOUNT,
                    ) as ApiResult.Success
                ).data

            assertEquals(ID, created.id)
            val sent = server.takeRequest()
            assertEquals("POST", sent.method)
            assertEquals("/api/v1/customer/addresses", sent.url.encodedPath)
            assertTrue(checkNotNull(sent.body).utf8().contains(""""reference":"Frente al parque""""))
        }

    @Test
    fun `create con 422 devuelve ValidationError`() =
        runTest {
            server.enqueue(problem(422, "validation_error"))

            val result = addresses().create(CreateCustomerAddressRequest(reference = "x"), ACCOUNT)
            val error = (result as ApiResult.Failure).error

            assertEquals(ApiErrorCode.ValidationError, (error as AppError.Known).code)
        }

    @Test
    fun `create es un POST sin Idempotency-Key y un 503 NO se reintenta`() =
        runTest {
            server.enqueue(problem(503, "internal_error"))
            server.enqueue(json(201, """{"data":$ADDRESS}"""))

            val result = addresses().create(CreateCustomerAddressRequest(reference = "Frente al parque"), ACCOUNT)

            assertTrue(result is ApiResult.Failure)
            assertEquals(1, server.requestCount)
            assertNull(server.takeRequest().headers["Idempotency-Key"])
        }

    @Test
    fun `update manda PATCH a la ruta del id`() =
        runTest {
            server.enqueue(json(200, """{"data":$ADDRESS}"""))

            val result = addresses().update(ID, UpdateCustomerAddressRequest(label = "Trabajo"), ACCOUNT)

            assertTrue(result is ApiResult.Success)
            val sent = server.takeRequest()
            assertEquals("PATCH", sent.method)
            assertEquals("/api/v1/customer/addresses/$ID", sent.url.encodedPath)
            assertTrue(checkNotNull(sent.body).utf8().contains(""""label":"Trabajo""""))
        }

    @Test
    fun `update con 404 devuelve NotFound`() =
        runTest {
            server.enqueue(problem(404, "not_found"))

            val result = addresses().update(ID, UpdateCustomerAddressRequest(label = "x"), ACCOUNT)
            val error = (result as ApiResult.Failure).error

            assertEquals(ApiErrorCode.NotFound, (error as AppError.Known).code)
        }

    @Test
    fun `delete manda DELETE y un 204 sin cuerpo es exito`() =
        runTest {
            server.enqueue(MockResponse.Builder().code(204).build())

            val result = addresses().delete(ID, ACCOUNT)

            assertTrue(result is ApiResult.Success)
            val sent = server.takeRequest()
            assertEquals("DELETE", sent.method)
            assertEquals("/api/v1/customer/addresses/$ID", sent.url.encodedPath)
        }

    @Test
    fun `delete con 404 devuelve NotFound`() =
        runTest {
            server.enqueue(problem(404, "not_found"))

            val error = (addresses().delete(ID, ACCOUNT) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.NotFound, (error as AppError.Known).code)
        }

    @Test
    fun `cada operacion con el token de otra cuenta no envia nada`() =
        runTest {
            tokens.token = testJwt(OTHER_ACCOUNT)
            val repo = addresses()

            val results =
                listOf(
                    repo.list(ACCOUNT),
                    repo.create(CreateCustomerAddressRequest(reference = "Frente al parque"), ACCOUNT),
                    repo.update(ID, UpdateCustomerAddressRequest(label = "Trabajo"), ACCOUNT),
                    repo.delete(ID, ACCOUNT),
                )

            for (result in results) {
                val error = (result as ApiResult.Failure).error
                assertTrue(error is AppError.Network && error.cause is AccountMismatchException)
            }
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `un 401 con refresco a otra cuenta no repite la peticion con el token nuevo`() =
        runTest {
            tokens.onRefresh = testJwt(OTHER_ACCOUNT)
            server.enqueue(problem(401, "unauthorized"))

            val result = addresses().update(ID, UpdateCustomerAddressRequest(label = "Trabajo"), ACCOUNT)

            assertTrue((result as ApiResult.Failure).error is AppError.Network)
            assertEquals(1, server.requestCount)
        }

    private companion object {
        val ID: UUID = UUID.fromString("9e2a737a-018f-4c2d-9a11-6f0d3c1e8a05")
        const val ACCOUNT = "6f1c3a52-9d0e-4c1b-8a77-2f4e5d6c7b8a"
        const val OTHER_ACCOUNT = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b"

        const val ADDRESS = """
            {"id":"9e2a737a-018f-4c2d-9a11-6f0d3c1e8a05","label":"Casa","line":"Jr. Lima 123",
             "reference":"Frente al parque","coordinates":{"lat":-9.3333333,"lng":-77.5},"isDefault":true,
             "locationConfirmedAt":null,"locationAccuracyM":null,
             "createdAt":"2026-10-26T15:00:00.000Z","updatedAt":"2026-10-26T15:00:00.000Z"}
        """
    }
}
