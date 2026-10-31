package com.tindivo.customer.feature.phone

import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.PhoneRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.FakeSessionStore
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.concurrent.TimeUnit

/** Un reloj que la prueba mueve a mano. */
private class MutableClock(
    var now: Instant,
) : Clock() {
    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId): Clock = this

    override fun instant(): Instant = now
}

@OptIn(ExperimentalCoroutinesApi::class)
class PhoneVerifyViewModelTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()
    private val store = FakeSessionStore()
    private val clock = MutableClock(Instant.parse("2026-10-30T15:00:00Z"))
    private lateinit var baseUrl: String
    private lateinit var configService: ConfigService

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server.start()
        baseUrl = server.url("/api/v1").toString().trimEnd('/')
        configService =
            ConfigService(SystemRepository(baseUrl, client(), dispatcher), "0.1.0", CoroutineScope(dispatcher))
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    private fun client() =
        createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = RetryInterceptor(sleeper = { _, _ -> }))

    private fun viewModel(io: CoroutineDispatcher = dispatcher) =
        PhoneVerifyViewModel(PhoneRepository(baseUrl, client(), io), store, configService, clock)

    private fun response(
        code: Int,
        body: String,
        delayMillis: Long = 0,
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", if (code == 200) "application/json" else "application/problem+json")
        .apply { if (delayMillis > 0) bodyDelay(delayMillis, TimeUnit.MILLISECONDS) }
        .body(body)
        .build()

    /** Llega al paso del código con el número 987654321. */
    private fun PhoneVerifyViewModel.toCodeStep() {
        server.enqueue(response(200, SENT))
        onPhoneChanged("987654321")
        sendCode()
    }

    @Test
    fun `camino feliz manda el numero, luego el codigo y termina verificado`() =
        runTest {
            val viewModel = viewModel()
            viewModel.toCodeStep()
            assertEquals(PhoneStep.Code, viewModel.state.value.step)

            server.enqueue(response(200, VERIFIED))
            viewModel.onCodeChanged("123456")
            viewModel.verify()

            assertEquals(PhoneStep.Done, viewModel.state.value.step)
            assertEquals("+51987654321", viewModel.state.value.verifiedPhone)
            assertEquals("""{"phone":"987654321"}""", server.takeRequest().body?.utf8())
            assertEquals("""{"phone":"987654321","code":"123456"}""", server.takeRequest().body?.utf8())
        }

    @Test
    fun `send-code con verified true va directo al exito sin pedir codigo`() =
        runTest {
            server.enqueue(response(200, """{"data":{"sent":true,"channel":"dev","verified":true}}"""))
            val viewModel = viewModel()

            viewModel.onPhoneChanged("987654321")
            viewModel.sendCode()

            assertEquals(PhoneStep.Done, viewModel.state.value.step)
            assertEquals("+51987654321", viewModel.state.value.verifiedPhone)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `un numero que no empieza por 9 o corto no sale a la red`() =
        runTest {
            val viewModel = viewModel()

            viewModel.onPhoneChanged("812345678")
            viewModel.sendCode()
            assertEquals(PhoneError.InvalidNumber, viewModel.state.value.error)

            viewModel.onPhoneChanged("9876")
            viewModel.sendCode()
            assertEquals(PhoneError.InvalidNumber, viewModel.state.value.error)
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `un codigo de menos de 6 digitos no sale a la red`() =
        runTest {
            val viewModel = viewModel()
            viewModel.toCodeStep()

            viewModel.onCodeChanged("12a3")
            viewModel.verify()

            assertEquals("123", viewModel.state.value.code)
            assertEquals(PhoneError.InvalidCode, viewModel.state.value.error)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `codigo incorrecto es un 409 sin transfer y muestra su detail`() =
        runTest {
            val viewModel = viewModel()
            viewModel.toCodeStep()
            server.enqueue(response(409, CONFLICT_PLAIN))

            viewModel.onCodeChanged("000000")
            viewModel.verify()

            val state = viewModel.state.value
            assertEquals(PhoneStep.Code, state.step)
            assertEquals(PhoneError.Server("El código ya no sirve. Pide uno nuevo."), state.error)
            assertNull(state.transfer)
        }

    @Test
    fun `un 429 al enviar muestra el detail del servidor`() =
        runTest {
            server.enqueue(response(429, RATE_LIMITED))
            val viewModel = viewModel()

            viewModel.onPhoneChanged("987654321")
            viewModel.sendCode()

            assertEquals(PhoneError.Server("Ya pediste 3 códigos hoy. Inténtalo mañana."), viewModel.state.value.error)
            assertEquals(PhoneStep.Number, viewModel.state.value.step)
        }

    @Test
    fun `un 422 muestra el mensaje del campo`() =
        runTest {
            server.enqueue(response(422, VALIDATION))
            val viewModel = viewModel()

            viewModel.onPhoneChanged("987654321")
            viewModel.sendCode()

            assertEquals(PhoneError.Server("Número de celular inválido"), viewModel.state.value.error)
        }

    @Test
    fun `un 500 muestra el error generico y no se reintenta`() =
        runTest {
            server.enqueue(response(500, INTERNAL))
            server.enqueue(response(200, SENT))
            val viewModel = viewModel()

            viewModel.onPhoneChanged("987654321")
            viewModel.sendCode()

            assertEquals(PhoneError.Generic, viewModel.state.value.error)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `traslado confirmado manda el challengeId y termina verificado`() =
        runTest {
            val viewModel = viewModel()
            viewModel.toCodeStep()
            server.enqueue(response(409, CONFLICT_TRANSFER))
            viewModel.onCodeChanged("123456")
            viewModel.verify()
            assertNotNull(viewModel.state.value.transfer)
            assertNull(viewModel.state.value.error)

            server.enqueue(response(200, TRANSFERRED))
            viewModel.confirmTransfer()

            assertEquals(PhoneStep.Done, viewModel.state.value.step)
            assertNull(viewModel.state.value.transfer)
            server.takeRequest()
            server.takeRequest()
            val transfer = server.takeRequest()
            assertEquals("/api/v1/customer/phone/transfer", transfer.url.encodedPath)
            assertEquals("""{"challengeId":"$CHALLENGE"}""", transfer.body?.utf8())
        }

    @Test
    fun `cancelar el traslado no llama y olvida el permiso y el codigo`() =
        runTest {
            val viewModel = viewModel()
            viewModel.toCodeStep()
            server.enqueue(response(409, CONFLICT_TRANSFER))
            viewModel.onCodeChanged("123456")
            viewModel.verify()

            viewModel.dismissTransfer()
            viewModel.confirmTransfer()

            assertNull(viewModel.state.value.transfer)
            assertEquals("", viewModel.state.value.code)
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `un challengeId vencido segun el reloj no se envia`() =
        runTest {
            val viewModel = viewModel()
            viewModel.toCodeStep()
            server.enqueue(response(409, CONFLICT_TRANSFER))
            viewModel.onCodeChanged("123456")
            viewModel.verify()

            clock.now = Instant.parse("2026-10-30T15:11:00Z")
            viewModel.confirmTransfer()

            assertNull(viewModel.state.value.transfer)
            assertEquals(PhoneError.ChallengeExpired, viewModel.state.value.error)
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `un 409 al trasladar muestra su detail`() =
        runTest {
            val viewModel = viewModel()
            viewModel.toCodeStep()
            server.enqueue(response(409, CONFLICT_TRANSFER))
            viewModel.onCodeChanged("123456")
            viewModel.verify()

            server.enqueue(response(409, CONFLICT_PLAIN))
            viewModel.confirmTransfer()

            assertEquals(PhoneError.Server("El código ya no sirve. Pide uno nuevo."), viewModel.state.value.error)
            assertNull(viewModel.state.value.transfer)
        }

    @Test
    fun `dos toques en enviar hacen una sola llamada`() =
        runTest {
            server.enqueue(response(200, SENT, delayMillis = 300))
            val viewModel = viewModel(Dispatchers.IO)

            viewModel.onPhoneChanged("987654321")
            viewModel.sendCode()
            viewModel.sendCode()
            viewModel.state.first { !it.sending }

            assertEquals(1, server.requestCount)
            assertEquals(PhoneStep.Code, viewModel.state.value.step)
        }

    @Test
    fun `al cerrar la sesion a mitad se borra el estado y no hay mas llamadas`() =
        runTest {
            val viewModel = viewModel(Dispatchers.IO)
            server.enqueue(response(200, SENT))
            viewModel.onPhoneChanged("987654321")
            viewModel.sendCode()
            viewModel.state.first { !it.sending }
            server.enqueue(response(200, VERIFIED, delayMillis = 300))
            viewModel.onCodeChanged("123456")
            viewModel.verify()

            store.signOut()

            assertEquals(PhoneUiState(loggedOut = true), viewModel.state.value)
            val before = server.requestCount
            viewModel.verify()
            viewModel.sendCode()
            viewModel.confirmTransfer()
            assertEquals(before, server.requestCount)
            assertEquals(PhoneUiState(loggedOut = true), viewModel.state.value)
        }

    @Test
    fun `cerrada la sesion desde el paso del codigo ninguna accion cambia el estado ni sale a la red`() =
        runTest {
            val viewModel = viewModel()
            viewModel.toCodeStep()
            viewModel.onCodeChanged("123456")

            store.signOut()

            val closed = PhoneUiState(loggedOut = true)
            assertEquals(closed, viewModel.state.value)
            val before = server.requestCount
            viewModel.changeNumber()
            viewModel.onPhoneChanged("912345678")
            viewModel.onCodeChanged("654321")
            viewModel.sendCode()
            clock.now = Instant.parse("2026-10-30T15:05:00Z")
            viewModel.resend()
            viewModel.verify()
            viewModel.confirmTransfer()
            viewModel.dismissTransfer()
            assertEquals(closed, viewModel.state.value)
            assertEquals(before, server.requestCount)
        }

    @Test
    fun `el cambio directo de cuenta cierra igual y no se reabre`() =
        runTest {
            val viewModel = viewModel()
            viewModel.toCodeStep()

            store.signInUserId = "user-2"
            store.signInWithGoogle("token", "nonce")

            val closed = PhoneUiState(loggedOut = true)
            assertEquals(closed, viewModel.state.value)
            val before = server.requestCount
            viewModel.changeNumber()
            viewModel.onPhoneChanged("912345678")
            viewModel.sendCode()
            assertEquals(closed, viewModel.state.value)
            assertEquals(before, server.requestCount)
        }

    @Test
    fun `una respuesta que llega tras cerrar la sesion no se publica`() =
        runTest {
            server.enqueue(response(200, SENT, delayMillis = 300))
            val viewModel = viewModel(Dispatchers.IO)

            viewModel.onPhoneChanged("987654321")
            viewModel.sendCode()
            store.signOut()

            assertEquals(PhoneUiState(loggedOut = true), viewModel.state.value)
            Thread.sleep(500)
            assertEquals(PhoneUiState(loggedOut = true), viewModel.state.value)
            // La llamada pudo no haber salido aún cuando se cerró la sesión; nunca sale más de una.
            assertTrue(server.requestCount <= 1)
        }

    @Test
    fun `un 401 cierra la sesion`() =
        runTest {
            server.enqueue(response(401, UNAUTHORIZED))
            val viewModel = viewModel()

            viewModel.onPhoneChanged("987654321")
            viewModel.sendCode()

            assertEquals(1, store.signOutCalls)
            assertEquals(PhoneUiState(loggedOut = true), viewModel.state.value)
        }

    @Test
    fun `un segundo enviar desde el paso del codigo no sale a la red antes de los 60 segundos`() =
        runTest {
            val viewModel = viewModel()
            viewModel.toCodeStep()
            assertEquals(1, server.requestCount)

            server.enqueue(response(200, SENT))
            viewModel.sendCode()

            assertEquals(1, server.requestCount)
            assertEquals(PhoneStep.Code, viewModel.state.value.step)
        }

    @Test
    fun `reenviar no se habilita antes de 60 segundos`() =
        runTest {
            val viewModel = viewModel()
            viewModel.toCodeStep()
            server.enqueue(response(200, SENT))

            clock.now = Instant.parse("2026-10-30T15:00:59Z")
            viewModel.resend()
            assertEquals(1, server.requestCount)

            clock.now = Instant.parse("2026-10-30T15:01:00Z")
            viewModel.resend()
            assertEquals(2, server.requestCount)
            assertEquals(PhoneStep.Code, viewModel.state.value.step)
        }

    @Test
    fun `cambiar de numero vuelve al paso del numero y borra el codigo`() =
        runTest {
            val viewModel = viewModel()
            viewModel.toCodeStep()
            viewModel.onCodeChanged("123456")

            viewModel.changeNumber()

            assertEquals(PhoneStep.Number, viewModel.state.value.step)
            assertEquals("", viewModel.state.value.code)
            assertEquals("987654321", viewModel.state.value.phone)
        }

    private companion object {
        const val CHALLENGE = "7c2a737a-018f-4c2d-9a11-6f0d3c1e8a09"
        const val SENT = """{"data":{"sent":true,"channel":"sms"}}"""
        const val VERIFIED = """{"data":{"verified":true,"phone":"+51987654321"}}"""
        const val TRANSFERRED = """{"data":{"verified":true,"phone":"+51987654321","transferred":true}}"""
        const val UNAUTHORIZED = """{"type":"about:blank","title":"No autorizado","status":401,"code":"unauthorized"}"""
        const val INTERNAL = """{"type":"about:blank","title":"Error","status":500,"code":"internal_error"}"""
        const val RATE_LIMITED = """
            {"type":"about:blank","title":"Demasiados intentos","status":429,"code":"rate_limited",
             "detail":"Ya pediste 3 códigos hoy. Inténtalo mañana."}
        """
        const val CONFLICT_PLAIN = """
            {"type":"about:blank","title":"Conflicto","status":409,"code":"conflict",
             "detail":"El código ya no sirve. Pide uno nuevo."}
        """
        const val CONFLICT_TRANSFER = """
            {"type":"about:blank","title":"Conflicto","status":409,"code":"conflict",
             "detail":"Ese número ya está verificado en otra cuenta.",
             "transfer":{"challengeId":"$CHALLENGE","expiresAt":"2026-10-30T10:10:00-05:00"}}
        """
        const val VALIDATION = """
            {"type":"about:blank","title":"Datos inválidos","status":422,"code":"validation_error",
             "errors":[{"field":"phone","message":"Número de celular inválido"}]}
        """
    }
}
