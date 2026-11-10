package com.tindivo.core.network

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** `DELETE /customer/account` ([CustomerRepository.deleteAccount]) sobre el cliente REAL de la app. */
@OptIn(ExperimentalCoroutinesApi::class)
class DeleteAccountRepositoryTest {
    private val server = MockWebServer()
    private val info = ClientInfo("customer", "0.1.0", "1")
    private val tokens = SwitchableTokens(token = testJwt(ACCOUNT))

    // Los reintentos no duermen: si el DELETE se reintentara, se vería en el conteo de peticiones, no en el reloj.
    private val noSleep = RetryInterceptor(sleeper = { _, _ -> })

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun repository() =
        CustomerRepository(
            baseUrl = server.url("/api/v1").toString().trimEnd('/'),
            client = createOkHttpClient(info, retry = noSleep, auth = BearerAuthInterceptor(server.url("/"), tokens)),
            ioDispatcher = UnconfinedTestDispatcher(),
        )

    private fun problem(
        code: Int,
        slug: String,
        detail: String = "Detalle",
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", "application/problem+json")
        .body("""{"type":"about:blank","title":"x","status":$code,"code":"$slug","detail":"$detail"}""")
        .build()

    @Test
    fun `204 sin cuerpo es un exito y sale un solo DELETE a la ruta con el token de la cuenta`() =
        runTest {
            server.enqueue(MockResponse(code = 204))

            val result = repository().deleteAccount(ACCOUNT)

            assertEquals(ApiResult.Success(Unit), result)
            assertEquals(1, server.requestCount)
            val request = server.takeRequest()
            assertEquals("DELETE", request.method)
            assertEquals("/api/v1/customer/account", request.url.encodedPath)
            assertEquals("Bearer ${testJwt(ACCOUNT)}", request.headers["Authorization"])
            assertEquals("android", request.headers["X-Tindivo-Platform"])
        }

    @Test
    fun `409 trae el motivo del servidor tal cual en detail`() =
        runTest {
            server.enqueue(problem(409, "conflict", MOTIVO))

            val error = (repository().deleteAccount(ACCOUNT) as ApiResult.Failure).error

            assertEquals(AppError.Known(ApiErrorCode.Conflict, 409, MOTIVO), error)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `401 sin refresco posible es Unauthorized y sale una sola peticion`() =
        runTest {
            tokens.onRefresh = null
            server.enqueue(problem(401, "unauthorized"))

            val error = (repository().deleteAccount(ACCOUNT) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.Unauthorized, (error as AppError.Known).code)
            assertEquals(401, error.status)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `401 con refresco de la misma cuenta repite una sola vez y el segundo 401 es el resultado`() =
        runTest {
            tokens.onRefresh = testJwt(ACCOUNT)
            server.enqueue(problem(401, "unauthorized"))
            server.enqueue(problem(401, "unauthorized"))

            val error = (repository().deleteAccount(ACCOUNT) as ApiResult.Failure).error

            assertEquals(401, (error as AppError.Known).status)
            // Repetir tras un 401 no duplica nada: el servidor rechazó la sesión antes de tocar datos.
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `con el token de otra cuenta no sale ninguna peticion`() =
        runTest {
            tokens.token = testJwt(OTHER_ACCOUNT)
            server.enqueue(MockResponse(code = 204))

            val error = (repository().deleteAccount(ACCOUNT) as ApiResult.Failure).error

            assertTrue(error is AppError.Network && error.cause is AccountMismatchException)
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `si el refresco tras un 401 trae el token de otra cuenta, el repetido no sale`() =
        runTest {
            tokens.onRefresh = testJwt(OTHER_ACCOUNT)
            server.enqueue(problem(401, "unauthorized"))
            server.enqueue(MockResponse(code = 204))

            val error = (repository().deleteAccount(ACCOUNT) as ApiResult.Failure).error

            assertTrue(error is AppError.Network && error.cause is AccountMismatchException)
            // Solo el primer intento, con el token de la cuenta que confirmó.
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `sin sesion no sale ninguna peticion`() =
        runTest {
            tokens.token = null
            server.enqueue(MockResponse(code = 204))

            val error = (repository().deleteAccount(ACCOUNT) as ApiResult.Failure).error

            assertTrue(error is AppError.Network && error.cause is AccountMismatchException)
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `un 5xx no se reintenta, ni siquiera con Retry-After`() =
        runTest {
            repeat(3) {
                server.enqueue(
                    MockResponse
                        .Builder()
                        .code(503)
                        .addHeader("Retry-After", "0")
                        .build(),
                )
            }

            val result = repository().deleteAccount(ACCOUNT)

            assertTrue(result is ApiResult.Failure)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `un corte tras enviar la peticion, como un timeout, es Network y no se reintenta`() =
        runTest {
            repeat(3) { server.enqueue(MockResponse.Builder().onResponseStart(SocketEffect.CloseSocket()).build()) }

            val error = (repository().deleteAccount(ACCOUNT) as ApiResult.Failure).error

            assertTrue(error is AppError.Network)
            // La petición llegó al servidor una sola vez: el resultado es incierto, pero no se repitió a escondidas.
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `un corte antes de enviar es Network y no se reintenta`() =
        runTest {
            repeat(3) { server.enqueue(MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build()) }

            val error = (repository().deleteAccount(ACCOUNT) as ApiResult.Failure).error

            assertTrue(error is AppError.Network)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `426 es UpgradeRequired con la version minima`() =
        runTest {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(426)
                    .addHeader("Content-Type", "application/problem+json")
                    .addHeader("X-Tindivo-Min-Version", "2.0.0")
                    .body("""{"type":"about:blank","title":"x","status":426,"code":"client_upgrade_required"}""")
                    .build(),
            )

            val error = (repository().deleteAccount(ACCOUNT) as ApiResult.Failure).error

            assertEquals(AppError.UpgradeRequired("2.0.0"), error)
        }

    private companion object {
        const val ACCOUNT = "6f1c3a52-9d0e-4c1b-8a77-2f4e5d6c7b8a"
        const val OTHER_ACCOUNT = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b"
        const val MOTIVO = "Tienes un pedido en curso. Cuando termine o lo canceles, podrás borrar tu cuenta."
    }
}
