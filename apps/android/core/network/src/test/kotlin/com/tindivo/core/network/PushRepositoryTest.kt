package com.tindivo.core.network

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.UUID

/** `PUT` y `DELETE /push/devices/{installId}` ([PushRepository]) sobre el cliente REAL de la app. */
@OptIn(ExperimentalCoroutinesApi::class)
class PushRepositoryTest {
    private val server = MockWebServer()
    private val info = ClientInfo("customer", "0.1.0", "1")
    private val tokens = SwitchableTokens(token = testJwt(ACCOUNT))
    private val noSleep = RetryInterceptor(sleeper = { _, _ -> })
    private val installId = UUID.fromString("5f3c2b1a-0d9e-4c8b-a7f6-e5d4c3b2a190")
    private val device =
        PushDeviceInfo(
            token = FCM_TOKEN,
            appVersion = "0.1.0",
            notificationsEnabled = true,
            osVersion = "14",
            locale = "es-PE",
            timezone = "America/Lima",
        )

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun repository() =
        PushRepository(
            baseUrl = server.url("/api/v1").toString().trimEnd('/'),
            client = createOkHttpClient(info, retry = noSleep, auth = BearerAuthInterceptor(server.url("/"), tokens)),
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

    @Test
    fun `el registro es un PUT a la ruta del installId con el cuerpo del contrato y el token de la cuenta`() =
        runTest {
            server.enqueue(json(200, REGISTERED))

            val result = repository().register(installId, device, ACCOUNT)

            assertEquals(ApiResult.Success(Unit), result)
            val request = server.takeRequest()
            assertEquals("PUT", request.method)
            assertEquals("/api/v1/push/devices/$installId", request.url.encodedPath)
            assertEquals("Bearer ${testJwt(ACCOUNT)}", request.headers["Authorization"])
            val body = Json.parseToJsonElement(request.body?.utf8() ?: "").jsonObject
            assertEquals(JsonPrimitive("android"), body["platform"])
            assertEquals(JsonPrimitive("customer"), body["app"])
            assertEquals(JsonPrimitive("production"), body["environment"])
            assertEquals(JsonPrimitive(FCM_TOKEN), body["token"])
            assertEquals(JsonPrimitive(true), body["notificationsEnabled"])
            assertEquals(JsonPrimitive("0.1.0"), body["appVersion"])
            assertFalse("un opcional ausente no viaja", (body as JsonObject).containsKey("deviceModel"))
        }

    @Test
    fun `con la sesion de otra cuenta no sale nada`() =
        runTest {
            tokens.token = testJwt("otra-cuenta")

            val register = repository().register(installId, device, ACCOUNT)
            val unregister = repository().unregister(installId, ACCOUNT)

            for (result in listOf(register, unregister)) {
                val error = (result as ApiResult.Failure).error
                assertTrue(error is AppError.Network && error.cause is AccountMismatchException)
            }
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `un 409 llega como conflict, sin reintentar el PUT`() =
        runTest {
            server.enqueue(json(409, problem(409, "conflict"), "application/problem+json"))

            val error = (repository().register(installId, device, ACCOUNT) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.Conflict, (error as AppError.Known).code)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `la baja es un DELETE a la ruta del installId y solo un 204 es exito`() =
        runTest {
            server.enqueue(MockResponse(code = 204))
            server.enqueue(MockResponse(code = 200))

            val ok = repository().unregister(installId, ACCOUNT)
            val other = repository().unregister(installId, ACCOUNT)

            assertEquals(ApiResult.Success(Unit), ok)
            assertEquals(ApiResult.Failure(AppError.Unknown(code = null, detail = "HTTP 200")), other)
            val request = server.takeRequest()
            assertEquals("DELETE", request.method)
            assertEquals("/api/v1/push/devices/$installId", request.url.encodedPath)
            assertEquals("Bearer ${testJwt(ACCOUNT)}", request.headers["Authorization"])
        }

    @Test
    fun `el token de FCM no sale en el toString`() {
        assertFalse(device.toString().contains(FCM_TOKEN))
        assertFalse(device.toString().contains("fcm-token"))
    }

    private fun problem(
        code: Int,
        slug: String,
    ) = """{"type":"about:blank","title":"x","status":$code,"code":"$slug"}"""

    private companion object {
        const val ACCOUNT = "3f0d6a52-2b8e-4c11-9a7d-1e2f3a4b5c6d"
        const val FCM_TOKEN = "fcm-token-0123456789-abcdefghijklmnopqrstuvwxyz"
        const val REGISTERED =
            """{"data":{"installId":"5f3c2b1a-0d9e-4c8b-a7f6-e5d4c3b2a190","platform":"android","app":"customer",""" +
                """"notificationsEnabled":true,"registeredAt":"2026-11-12T10:00:00Z","updatedAt":"2026-11-12T10:00:00Z"}}"""
    }
}
