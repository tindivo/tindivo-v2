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
    private fun addresses() =
        AddressRepository(
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

    @Test
    fun `list manda GET y decodifica las direcciones`() =
        runTest {
            server.enqueue(json(200, """{"data":{"items":[$ADDRESS]}}"""))

            val items = (addresses().list() as ApiResult.Success).data.items

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
                    ) as ApiResult.Success
                ).data

            assertEquals(ID, created.id)
            val sent = server.takeRequest()
            assertEquals("POST", sent.method)
            assertEquals("/api/v1/customer/addresses", sent.url.encodedPath)
            assertTrue(sent.body!!.utf8().contains(""""reference":"Frente al parque""""))
        }

    @Test
    fun `create con 422 devuelve ValidationError`() =
        runTest {
            server.enqueue(problem(422, "validation_error"))

            val error = (addresses().create(CreateCustomerAddressRequest(reference = "x")) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.ValidationError, (error as AppError.Known).code)
        }

    @Test
    fun `create es un POST sin Idempotency-Key y un 503 NO se reintenta`() =
        runTest {
            server.enqueue(problem(503, "internal_error"))
            server.enqueue(json(201, """{"data":$ADDRESS}"""))

            val result = addresses().create(CreateCustomerAddressRequest(reference = "Frente al parque"))

            assertTrue(result is ApiResult.Failure)
            assertEquals(1, server.requestCount)
            assertNull(server.takeRequest().headers["Idempotency-Key"])
        }

    @Test
    fun `update manda PATCH a la ruta del id`() =
        runTest {
            server.enqueue(json(200, """{"data":$ADDRESS}"""))

            val result = addresses().update(ID, UpdateCustomerAddressRequest(label = "Trabajo"))

            assertTrue(result is ApiResult.Success)
            val sent = server.takeRequest()
            assertEquals("PATCH", sent.method)
            assertEquals("/api/v1/customer/addresses/$ID", sent.url.encodedPath)
            assertTrue(sent.body!!.utf8().contains(""""label":"Trabajo""""))
        }

    @Test
    fun `update con 404 devuelve NotFound`() =
        runTest {
            server.enqueue(problem(404, "not_found"))

            val error = (addresses().update(ID, UpdateCustomerAddressRequest(label = "x")) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.NotFound, (error as AppError.Known).code)
        }

    @Test
    fun `delete manda DELETE y un 204 sin cuerpo es exito`() =
        runTest {
            server.enqueue(MockResponse.Builder().code(204).build())

            val result = addresses().delete(ID)

            assertTrue(result is ApiResult.Success)
            val sent = server.takeRequest()
            assertEquals("DELETE", sent.method)
            assertEquals("/api/v1/customer/addresses/$ID", sent.url.encodedPath)
        }

    @Test
    fun `delete con 404 devuelve NotFound`() =
        runTest {
            server.enqueue(problem(404, "not_found"))

            val error = (addresses().delete(ID) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.NotFound, (error as AppError.Known).code)
        }

    private companion object {
        val ID: UUID = UUID.fromString("9e2a737a-018f-4c2d-9a11-6f0d3c1e8a05")

        const val ADDRESS = """
            {"id":"9e2a737a-018f-4c2d-9a11-6f0d3c1e8a05","label":"Casa","line":"Jr. Lima 123",
             "reference":"Frente al parque","coordinates":{"lat":-9.3333333,"lng":-77.5},"isDefault":true,
             "locationConfirmedAt":null,"locationAccuracyM":null,
             "createdAt":"2026-10-26T15:00:00.000Z","updatedAt":"2026-10-26T15:00:00.000Z"}
        """
    }
}
