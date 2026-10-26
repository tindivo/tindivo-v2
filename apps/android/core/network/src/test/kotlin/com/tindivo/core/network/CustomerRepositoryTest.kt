package com.tindivo.core.network

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CustomerRepositoryTest {
    private val server = MockWebServer()
    private val info = ClientInfo("customer", "0.1.0", "1")
    private val noSleep = RetryInterceptor(sleeper = { _, _ -> })
    private lateinit var baseUrl: String

    private class FixedToken(
        private val token: String?,
    ) : AccessTokenSource {
        override suspend fun accessToken(): String? = token

        override suspend fun refresh(): String? = null
    }

    @Before
    fun setUp() {
        server.start()
        baseUrl = server.url("/api/v1").toString().trimEnd('/')
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun repository(auth: BearerAuthInterceptor? = null) =
        CustomerRepository(
            baseUrl = baseUrl,
            client = createOkHttpClient(info, retry = noSleep, auth = auth),
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
    fun `profile con 200 devuelve el nombre y la verificacion del telefono`() =
        runTest {
            server.enqueue(json(200, PROFILE))

            val data = (repository().profile() as ApiResult.Success).data

            assertEquals("Rosa Quispe", data.fullName)
            assertEquals("+51987654321", data.phone)
            assertTrue(data.phoneVerified)
            assertNull(data.blockedUntil)
            val request = server.takeRequest()
            assertEquals("/api/v1/customer/profile", request.url.encodedPath)
            assertEquals("android", request.headers["X-Tindivo-Platform"])
        }

    @Test
    fun `profile con 401 devuelve Failure sin lanzar`() =
        runTest {
            server.enqueue(json(401, UNAUTHORIZED, "application/problem+json"))

            val error = (repository().profile() as ApiResult.Failure).error

            assertTrue(error is AppError.Known)
            assertEquals(ApiErrorCode.Unauthorized, (error as AppError.Known).code)
            assertEquals(401, error.status)
        }

    @Test
    fun `profile manda el token de la sesion al origen de la API`() =
        runTest {
            server.enqueue(json(200, PROFILE))
            val auth = BearerAuthInterceptor(server.url("/"), FixedToken("token-de-prueba"))

            assertTrue(repository(auth).profile() is ApiResult.Success)

            assertEquals("Bearer token-de-prueba", server.takeRequest().headers["Authorization"])
        }

    @Test
    fun `profile con un cuerpo ilegible devuelve Unknown sin lanzar`() =
        runTest {
            server.enqueue(json(200, "{\"data\":{\"fullName\":7}}"))

            assertTrue((repository().profile() as ApiResult.Failure).error is AppError.Unknown)
        }

    private companion object {
        const val PROFILE = """
            {"data":{"fullName":"Rosa Quispe","phone":"+51987654321","phoneVerified":true,
             "phoneVerifiedAt":"2026-10-20T15:00:00.000Z","contraentregaBlocked":false,
             "blockedUntil":null,"blocked":false}}
        """

        const val UNAUTHORIZED = """{"type":"about:blank","title":"No autorizado","status":401,"code":"unauthorized"}"""
    }
}
