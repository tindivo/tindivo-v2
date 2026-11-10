package com.tindivo.customer.feature.orders

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.PrepayRepository
import com.tindivo.core.network.ProofUploader
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.core.network.createStorageUploadClient
import com.tindivo.customer.feature.checkout.SessionTokens
import com.tindivo.customer.feature.checkout.sessionJwt
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * El envío con el gateway real ([ApiPrepayGateway]) contra un servidor falso: la URL firmada que manda la API se valida
 * con `StorageUploadTarget.parse` antes de subir nada. El cliente de Storage desvía al servidor falso CUALQUIER host,
 * así que un `PUT` a una URL que no debía aceptarse se vería aquí como una petición más.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ProofSenderStorageTest {
    private val server = MockWebServer()
    private val io = UnconfinedTestDispatcher()
    private val encoder = FakeProofEncoder()

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun sender(): ProofSender {
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val api =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                retry = RetryInterceptor(sleeper = { _, _ -> }),
                auth = BearerAuthInterceptor(server.url("/"), SessionTokens(token = sessionJwt(PREPAY_ACCOUNT))),
            )
        val gateway =
            ApiPrepayGateway(
                PrepayRepository(baseUrl, api, io),
                CatalogRepository(baseUrl, api, io),
                ProofUploader(anyHostToServer(createStorageUploadClient()), io),
                PREPAY_STORAGE,
            )
        return ProofSender(gateway, encoder)
    }

    @Test
    fun `con la URL firmada del Storage esperado se sube y se confirma`() =
        runTest {
            server.enqueue(json(uploadUrl("$STORAGE$PREFIX$PATH?token=tok")))
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(200)
                    .body("""{"Key":"x"}""")
                    .build(),
            )
            server.enqueue(json("""{"data":{"ok":true}}"""))

            val step = sender().deliver(PREPAY_ACCOUNT, ORDER_ID, PHOTO) { true }

            assertEquals(SendStep.Done, step)
            assertEquals(3, server.requestCount)
            server.takeRequest()
            val put = server.takeRequest()
            assertEquals("PUT", put.method)
            assertEquals("$PREFIX$PATH", put.url.encodedPath)
            assertArrayEquals(encodedBytes(PHOTO), put.body?.toByteArray())
            assertNull(put.headers["Authorization"])
            assertEquals("""{"path":"$PATH"}""", server.takeRequest().body?.utf8())
        }

    @Test
    fun `una URL firmada que no pasa la validacion no se sube ni se confirma`() =
        runTest {
            val rejected =
                listOf(
                    "https://evil.test$PREFIX$PATH?token=tok",
                    "http://storage.test$PREFIX$PATH?token=tok",
                    "https://storage.test.evil.test$PREFIX$PATH?token=tok",
                    "https://storage.test/storage/v1/object/upload/sign/otro-bucket/$PATH?token=tok",
                    "$STORAGE${PREFIX}otra/ruta.jpg?token=tok",
                    "$STORAGE$PREFIX$PATH",
                    "https://user:pass@storage.test$PREFIX$PATH?token=tok",
                )
            for (raw in rejected) {
                val before = server.requestCount
                server.enqueue(json(uploadUrl(raw)))

                val step = sender().deliver(PREPAY_ACCOUNT, ORDER_ID, PHOTO) { true }

                val untrusted = AppError.Unknown(code = null, detail = UNTRUSTED_UPLOAD_URL)
                assertEquals(raw, SendStep.ApiFailed(untrusted, confirming = false), step)
                // Solo salió el POST que pidió la URL: ni PUT a ningún host ni confirmación.
                assertEquals(raw, before + 1, server.requestCount)
                val request = server.takeRequest()
                assertEquals(raw, "POST", request.method)
                assertEquals(raw, "/api/v1/customer/orders/$ORDER_ID/prepay-proof/upload-url", request.url.encodedPath)
            }
        }

    @Test
    fun `una URL firmada rechazada no se sube tampoco al reintentar`() =
        runTest {
            server.enqueue(json(uploadUrl("https://evil.test$PREFIX$PATH?token=tok")))
            server.enqueue(json(uploadUrl("https://evil.test$PREFIX$PATH?token=tok")))
            val sender = sender()

            sender.deliver(PREPAY_ACCOUNT, ORDER_ID, PHOTO) { true }
            val retry = sender.deliver(PREPAY_ACCOUNT, ORDER_ID, PHOTO) { true }

            assertTrue(retry is SendStep.ApiFailed)
            assertEquals(2, server.requestCount)
            repeat(2) { assertEquals("POST", server.takeRequest().method) }
        }

    /** Desvía cualquier petición (de cualquier host y esquema) al servidor falso, sin tocar nada más. */
    private fun anyHostToServer(client: OkHttpClient): OkHttpClient =
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

    private fun uploadUrl(raw: String) =
        """{"data":{"path":"$PATH","uploadUrl":"$raw","token":"tok","expiresAt":"2026-11-10T17:00:00.000Z"}}"""

    private fun json(body: String) =
        MockResponse
            .Builder()
            .code(200)
            .addHeader("Content-Type", "application/json")
            .body(body)
            .build()

    private companion object {
        const val STORAGE = "https://storage.test"
        const val PREFIX = "/storage/v1/object/upload/sign/payment-proofs/"
        const val PHOTO = "content://media/picker/0/foto-a"
        val PATH = prepayPath(1)
    }
}
