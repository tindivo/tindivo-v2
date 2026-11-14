package com.tindivo.core.network

import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ProofUploaderTest {
    private val server = MockWebServer()
    private val origin = "https://storage.test".toHttpUrl()

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun uploader() =
        ProofUploader(routedToServer(createStorageUploadClient(), server), UnconfinedTestDispatcher())

    private fun target(raw: String = "$ORIGIN$PREFIX$PATH?token=tok") = StorageUploadTarget.parse(raw, PATH, origin)

    @Test
    fun `una URL http se rechaza y no sale ninguna peticion`() {
        assertNull(target("http://storage.test$PREFIX$PATH?token=tok"))
        // Tampoco vale aunque el origen esperado se configurara como http.
        val plainOrigin = "http://storage.test".toHttpUrl()
        assertNull(StorageUploadTarget.parse("http://storage.test$PREFIX$PATH?token=tok", PATH, plainOrigin))
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `solo vale el host, el puerto, la ruta y el token esperados`() {
        assertNotNull(target())
        assertNull(target("https://evil.test$PREFIX$PATH?token=tok"))
        assertNull(target("https://storage.test.evil.test$PREFIX$PATH?token=tok"))
        assertNull(target("https://storage.test:8443$PREFIX$PATH?token=tok"))
        assertNull(target("https://user:pass@storage.test$PREFIX$PATH?token=tok"))
        assertNull(target("https://storage.test$PREFIX$PATH"))
        assertNull(target("https://storage.test$PREFIX$PATH?token="))
        assertNull(target("https://storage.test/storage/v1/object/upload/sign/otro-bucket/$PATH?token=tok"))
        assertNull(target("https://storage.test${PREFIX}otra/ruta.jpg?token=tok"))
        assertNull(target("https://storage.test$PREFIX$PATH?token=tok#x"))
        assertNull(target("no es una url"))
    }

    @Test
    fun `la URL firmada no aparece en toString`() {
        val text = target().toString()

        assertFalse(text.contains("tok"))
        assertFalse(text.contains("storage.test"))
        assertFalse(text.contains(PATH))
    }

    @Test
    fun `una redireccion a otro host no se sigue`() =
        runTest {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(307)
                    .addHeader("Location", "https://otro-host.test/robado")
                    .build(),
            )

            val outcome = uploader().upload(checkNotNull(target()), PHOTO)

            assertEquals(UploadOutcome.Rejected(307), outcome)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `el PUT no se reintenta ante un 503 ni ante un corte`() =
        runTest {
            server.enqueue(MockResponse.Builder().code(503).build())
            server.enqueue(MockResponse.Builder().onResponseStart(SocketEffect.CloseSocket()).build())
            server.enqueue(MockResponse.Builder().code(200).build())

            assertEquals(UploadOutcome.Rejected(503), uploader().upload(checkNotNull(target()), PHOTO))
            assertEquals(1, server.requestCount)

            val cut = uploader().upload(checkNotNull(target()), PHOTO)

            assertTrue(cut is UploadOutcome.Network)
            // El 200 que quedó en cola nunca se pidió: el corte no se repitió a escondidas.
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `un 503 con Retry-After 0 no repite el PUT`() =
        runTest {
            // OkHttp repite por su cuenta un 503 con `Retry-After: 0` si el cuerpo se puede volver a enviar (CAX-001).
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(503)
                    .addHeader("Retry-After", "0")
                    .build(),
            )
            server.enqueue(MockResponse.Builder().code(200).build())

            val outcome = uploader().upload(checkNotNull(target()), PHOTO)

            assertEquals(UploadOutcome.Rejected(503), outcome)
            // El 200 que quedó en cola nunca se pidió: salió un solo PUT.
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `el PUT no lleva token, cabeceras de la app ni cookies`() =
        runTest {
            server.enqueue(MockResponse.Builder().code(200).build())

            uploader().upload(checkNotNull(target()), PHOTO)

            val put = server.takeRequest()
            assertEquals("PUT", put.method)
            assertEquals("false", put.headers["x-upsert"])
            assertNull(put.headers["Authorization"])
            assertNull(put.headers["Cookie"])
            assertTrue(put.headers.names().none { it.startsWith("x-tindivo", ignoreCase = true) })
        }

    @Test
    fun `el cliente de Storage no tiene interceptores, redirecciones ni reintentos`() {
        val client = createStorageUploadClient()

        assertTrue(client.interceptors.isEmpty())
        assertTrue(client.networkInterceptors.isEmpty())
        assertFalse(client.followRedirects)
        assertFalse(client.followSslRedirects)
        assertFalse(client.retryOnConnectionFailure)
        assertNull(client.cache)
    }

    private companion object {
        const val ORIGIN = "https://storage.test"
        const val PREFIX = StorageUploadTarget.UPLOAD_PATH_PREFIX
        const val PATH = "4f1c2b9e-7a35-4d61-9b1e-0c3d2a5f8e71/5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01/attempt-1-1.jpg"
        val PHOTO = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xD9.toByte())
    }
}
