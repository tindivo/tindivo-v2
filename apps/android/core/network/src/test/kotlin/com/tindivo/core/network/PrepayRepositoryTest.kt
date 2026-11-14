package com.tindivo.core.network

import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.math.BigDecimal
import java.util.UUID

/**
 * El prepago de punta a punta contra un servidor falso: las tres llamadas a la API van con la sesión y las cabeceras de
 * la app; el `PUT` a Storage, sin ninguna de las dos. Storage es `https://storage.test`: la prueba desvía esas
 * peticiones al servidor falso (que habla HTTP), sin añadirles nada.
 */
class PrepayRepositoryTest {
    private val server = MockWebServer()
    private val info = ClientInfo("customer", "0.1.0", "1")
    private val tokens = SwitchableTokens(token = testJwt(ACCOUNT))
    private val io = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun repository() =
        PrepayRepository(
            baseUrl = server.url("/api/v1").toString().trimEnd('/'),
            client =
                createOkHttpClient(
                    info,
                    retry = RetryInterceptor(sleeper = { _, _ -> }),
                    auth = BearerAuthInterceptor(server.url("/"), tokens),
                ),
            ioDispatcher = io,
        )

    private fun uploader() = ProofUploader(routedToServer(createStorageUploadClient(), server), io)

    @Test
    fun `camino feliz - info, URL firmada, PUT y confirmacion en ese orden`() =
        runTest {
            server.enqueue(json(200, INFO))
            server.enqueue(json(200, UPLOAD_URL))
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(200)
                    .body("""{"Key":"x"}""")
                    .build(),
            )
            server.enqueue(json(200, """{"data":{"ok":true}}"""))
            val repository = repository()

            val prepay = (repository.info(ACCOUNT, ORDER) as ApiResult.Success).data
            val slot = (repository.uploadUrl(ACCOUNT, ORDER) as ApiResult.Success).data
            val target = assertNotNullTarget(slot.uploadUrl, slot.path)
            val outcome = uploader().upload(target, PHOTO)
            val confirmed = repository.confirm(ACCOUNT, ORDER, slot.path)

            assertEquals(BigDecimal("43.5"), prepay.total)
            assertEquals("awaiting_payment", prepay.status)
            assertEquals("987654321", prepay.paymentQr?.accountNumber)
            assertEquals(UploadOutcome.Uploaded, outcome)
            assertTrue(confirmed is ApiResult.Success)

            val get = server.takeRequest()
            assertEquals("GET", get.method)
            assertEquals("/api/v1/customer/orders/$ORDER/prepay-info", get.url.encodedPath)
            val post = server.takeRequest()
            assertEquals("POST", post.method)
            assertEquals("/api/v1/customer/orders/$ORDER/prepay-proof/upload-url", post.url.encodedPath)
            assertEquals("""{"contentType":"image/jpeg"}""", post.body?.utf8())
            val put = server.takeRequest()
            assertEquals("PUT", put.method)
            assertEquals("/storage/v1/object/upload/sign/payment-proofs/$PATH", put.url.encodedPath)
            assertEquals("image/jpeg", put.headers["Content-Type"])
            assertArrayEquals(PHOTO, put.body?.toByteArray())
            val confirm = server.takeRequest()
            assertEquals("/api/v1/customer/orders/$ORDER/prepay-proof", confirm.url.encodedPath)
            assertEquals("""{"path":"$PATH"}""", confirm.body?.utf8())

            // Las tres de la API llevan sesión y cabeceras de cliente; la de Storage, ninguna de las dos.
            for (api in listOf(get, post, confirm)) {
                assertEquals("Bearer ${testJwt(ACCOUNT)}", api.headers["Authorization"])
                assertEquals("android", api.headers["X-Tindivo-Platform"])
            }
            assertNull(put.headers["Authorization"])
            assertTrue(put.headers.names().none { it.startsWith("x-tindivo", ignoreCase = true) })
            assertNull(put.headers["Idempotency-Key"])
            assertNull(put.headers["Cookie"])
        }

    @Test
    fun `con la sesion en otra cuenta no sale ninguna de las tres llamadas`() =
        runTest {
            tokens.token = testJwt("otra-cuenta")
            val repository = repository()

            val results =
                listOf(
                    repository.info(ACCOUNT, ORDER),
                    repository.uploadUrl(ACCOUNT, ORDER),
                    repository.confirm(ACCOUNT, ORDER, PATH),
                )

            for (result in results) {
                val error = (result as ApiResult.Failure).error
                assertTrue((error as AppError.Network).cause is AccountMismatchException)
            }
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `pedir la URL firmada no se reintenta solo ante un 503`() =
        runTest {
            server.enqueue(problem(503, "internal_error"))
            server.enqueue(json(200, UPLOAD_URL))

            val result = repository().uploadUrl(ACCOUNT, ORDER)

            assertTrue(result is ApiResult.Failure)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `confirmar no se reintenta solo ante un 503 ni ante un corte`() =
        runTest {
            server.enqueue(problem(503, "internal_error"))
            server.enqueue(json(200, """{"data":{"ok":true}}"""))

            val result = repository().confirm(ACCOUNT, ORDER, PATH)

            assertTrue(result is ApiResult.Failure)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `el 409 de un pedido que ya no espera pago llega con su codigo y su detalle`() =
        runTest {
            server.enqueue(problem(409, "invalid_state_transition"))

            val error = (repository().confirm(ACCOUNT, ORDER, PATH) as ApiResult.Failure).error as AppError.Known

            assertEquals(ApiErrorCode.InvalidStateTransition, error.code)
            assertEquals("Detalle del servidor", error.detail)
        }

    private fun assertNotNullTarget(
        raw: String,
        path: String,
    ): StorageUploadTarget {
        val target = StorageUploadTarget.parse(raw, path, STORAGE.toHttpUrl())
        assertNotNull(target)
        return checkNotNull(target)
    }

    private fun json(
        code: Int,
        body: String,
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", "application/json")
        .body(body)
        .build()

    private fun problem(
        code: Int,
        slug: String,
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", "application/problem+json")
        .body("""{"type":"about:blank","title":"x","status":$code,"code":"$slug","detail":"Detalle del servidor"}""")
        .build()

    companion object {
        const val ACCOUNT = "4f1c2b9e-7a35-4d61-9b1e-0c3d2a5f8e71"
        const val STORAGE = "https://storage.test"
        val ORDER: UUID = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01")
        val PATH = "$ACCOUNT/$ORDER/attempt-1-1731250000000.jpg"
        val PHOTO = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1, 2, 3, 0xFF.toByte(), 0xD9.toByte())
        const val INFO =
            """{"data":{"businessName":"Pollería Rosa","yapeNumber":"987654321","qrUrl":null,""" +
                """"paymentQr":{"slot":1,"wallet":"yape","accountNumber":"987654321","accountName":"Rosa P.",""" +
                """"qrUrl":null,"isDefault":true},"total":43.5,"status":"awaiting_payment","hasProof":false,""" +
                """"proofAttempt":0,"comprobantePrepagoUrl":null,"awaitingPaymentAt":"2026-11-10T15:00:00.000Z"}}"""
        val UPLOAD_URL =
            """{"data":{"path":"$PATH","uploadUrl":"$STORAGE/storage/v1/object/upload/sign/payment-proofs/$PATH""" +
                """?token=tok","token":"tok","expiresAt":"2026-11-10T17:00:00.000Z"}}"""
    }
}

/**
 * [client] con un único añadido de prueba: las peticiones a `https://…` van al [server] por HTTP, sin tocar sus
 * cabeceras ni su cuerpo. Hace de terminación TLS para no necesitar certificados en la prueba.
 */
internal fun routedToServer(
    client: OkHttpClient,
    server: MockWebServer,
): OkHttpClient =
    client
        .newBuilder()
        .addInterceptor { chain ->
            val original = chain.request()
            val routed =
                original.url
                    .newBuilder()
                    .scheme("http")
                    .host(server.hostName)
                    .port(server.port)
                    .build()
            chain.proceed(original.newBuilder().url(routed).build())
        }.build()
