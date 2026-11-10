package com.tindivo.customer.feature.profile

import com.tindivo.core.network.AccountMismatchException
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException

/** «Completa tu perfil»: un despachador que solo avanza cuando la prueba lo pide, sin esperas reales. */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val store = FakeSessionStore(SessionState.SignedIn(ACCOUNT))
    private val gateway = FakeProfileGateway()
    private val configService =
        ConfigService(
            SystemRepository(
                "http://localhost.invalid/api/v1",
                createOkHttpClient(ClientInfo("customer", "0.1.0", "1")),
                dispatcher,
            ),
            "0.1.0",
            CoroutineScope(dispatcher),
        )
    private lateinit var hint: GoogleNameHint

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        hint = GoogleNameHint(store, CoroutineScope(dispatcher))
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun TestScope.opened(): ProfileViewModel {
        val viewModel = ProfileViewModel(gateway, store, configService, hint)
        runCurrent()
        return viewModel
    }

    private fun TestScope.saving(name: String = "  Rosa Quispe "): ProfileViewModel {
        val viewModel = opened()
        viewModel.onName(name)
        viewModel.save()
        runCurrent()
        return viewModel
    }

    @Test
    fun `primero acepta los terminos y despues guarda el nombre recortado, los dos con la cuenta de la pantalla`() =
        runTest(dispatcher) {
            val viewModel = saving()
            advanceUntilIdle()

            assertEquals(listOf("terms:$TERMS_VERSION:$ACCOUNT", "name:Rosa Quispe:$ACCOUNT"), gateway.calls)
            assertEquals(ProfileOutcome.Saved, viewModel.state.value.outcome)
        }

    @Test
    fun `un nombre invalido no se puede guardar ni sale ninguna llamada`() =
        runTest(dispatcher) {
            val viewModel = opened()
            for (name in listOf("", "R", "Rosa 2", "Rosa 😀")) {
                viewModel.onName(name)
                assertFalse(name, viewModel.state.value.canSave)
                viewModel.save()
            }
            advanceUntilIdle()

            assertTrue(gateway.calls.isEmpty())
            assertNull(viewModel.state.value.outcome)
        }

    @Test
    fun `el campo no pasa de 40 y marca el error solo con lo que el servidor rechazaria`() =
        runTest(dispatcher) {
            val viewModel = opened()
            assertFalse(viewModel.state.value.nameError)

            viewModel.onName("a".repeat(45))
            assertEquals(40, viewModel.state.value.name.length)
            assertTrue(viewModel.state.value.canSave)

            viewModel.onName("R")
            assertFalse("una letra mientras se escribe no se marca", viewModel.state.value.nameError)
            viewModel.onName("R2")
            assertTrue(viewModel.state.value.nameError)
            viewModel.onName("")
            assertTrue("vaciarlo sí se marca", viewModel.state.value.nameError)
        }

    @Test
    fun `si los terminos fallan no se guarda el nombre, se conserva lo escrito y se puede reintentar`() =
        runTest(dispatcher) {
            gateway.termsResult = ApiResult.Failure(AppError.Network(IOException("sin red")))
            val viewModel = saving("Rosa Quispe")
            advanceUntilIdle()

            assertEquals(listOf("terms:$TERMS_VERSION:$ACCOUNT"), gateway.calls)
            val failed = viewModel.state.value
            assertEquals(ProfileSaveError.Network, failed.saveError)
            assertEquals("Rosa Quispe", failed.name)
            assertFalse(failed.saving)
            assertTrue(failed.canSave)

            gateway.termsResult = ApiResult.Success(Unit)
            viewModel.save()
            advanceUntilIdle()

            assertEquals(ProfileOutcome.Saved, viewModel.state.value.outcome)
            assertEquals("name:Rosa Quispe:$ACCOUNT", gateway.calls.last())
        }

    @Test
    fun `un error de red al guardar el nombre conserva el texto y el reintento lo guarda`() =
        runTest(dispatcher) {
            gateway.nameResult = ApiResult.Failure(AppError.Network(IOException("sin red")))
            val viewModel = saving("Rosa Quispe")
            advanceUntilIdle()

            assertEquals(ProfileSaveError.Network, viewModel.state.value.saveError)
            assertEquals("Rosa Quispe", viewModel.state.value.name)

            gateway.nameResult = ApiResult.Success(Unit)
            viewModel.save()
            advanceUntilIdle()

            assertEquals(ProfileOutcome.Saved, viewModel.state.value.outcome)
        }

    @Test
    fun `un doble toque manda una sola vez y mientras guarda el campo no cambia`() =
        runTest(dispatcher) {
            gateway.termsGate = CompletableDeferred()
            val viewModel = saving("Rosa Quispe")
            viewModel.save()
            viewModel.onName("Otra")
            runCurrent()

            assertTrue(viewModel.state.value.saving)
            assertEquals("Rosa Quispe", viewModel.state.value.name)
            gateway.termsGate?.complete(Unit)
            advanceUntilIdle()

            assertEquals(listOf("terms:$TERMS_VERSION:$ACCOUNT", "name:Rosa Quispe:$ACCOUNT"), gateway.calls)
        }

    @Test
    fun `un 401 tras el refresco cierra la sesion y sale sin guardar el nombre`() =
        runTest(dispatcher) {
            gateway.termsResult = ApiResult.Failure(AppError.Known(ApiErrorCode.Unauthorized, 401, null))
            val viewModel = saving()
            advanceUntilIdle()

            assertEquals(1, store.signOutCalls)
            assertEquals(ProfileOutcome.Left, viewModel.state.value.outcome)
            assertEquals(1, gateway.calls.size)
        }

    @Test
    fun `un 422 marca el campo y escribir de nuevo lo limpia`() =
        runTest(dispatcher) {
            gateway.nameResult = ApiResult.Failure(AppError.Known(ApiErrorCode.ValidationError, 422, null))
            val viewModel = saving()
            advanceUntilIdle()

            assertTrue(viewModel.state.value.rejected)
            assertTrue(viewModel.state.value.nameError)
            assertFalse(viewModel.state.value.saving)
            viewModel.onName("Rosa")
            assertFalse(viewModel.state.value.nameError)
        }

    @Test
    fun `un 426 avisa que hay que actualizar la app`() =
        runTest(dispatcher) {
            gateway.termsResult = ApiResult.Failure(AppError.UpgradeRequired("2.0.0"))
            val viewModel = saving()
            advanceUntilIdle()

            assertEquals(ConfigState.UpgradeRequired("2.0.0"), configService.state.value)
            assertFalse(viewModel.state.value.saving)
            assertEquals(1, gateway.calls.size)
        }

    @Test
    fun `si la cuenta cambia con el nombre en vuelo no se publica el exito`() =
        runTest(dispatcher) {
            gateway.nameGate = CompletableDeferred()
            val viewModel = saving()
            assertEquals("name:Rosa Quispe:$ACCOUNT", gateway.calls.last())

            store.switchTo(OTHER_ACCOUNT)
            runCurrent()
            gateway.nameGate?.complete(Unit)
            advanceUntilIdle()

            assertEquals(ProfileOutcome.Left, viewModel.state.value.outcome)
            assertEquals(0, store.signOutCalls)
        }

    @Test
    fun `si la cuenta cambia despues de los terminos el nombre no sale`() =
        runTest(dispatcher) {
            gateway.termsGate = CompletableDeferred()
            val viewModel = saving()

            // Los términos responden y la sesión cambia en el mismo paso, antes de que el colector la vea.
            gateway.termsGate?.complete(Unit)
            store.switchTo(OTHER_ACCOUNT)
            advanceUntilIdle()

            assertEquals(listOf("terms:$TERMS_VERSION:$ACCOUNT"), gateway.calls)
            assertEquals(ProfileOutcome.Left, viewModel.state.value.outcome)
        }

    @Test
    fun `una cuenta que cambia y llega antes que el colector tampoco publica el exito`() =
        runTest(dispatcher) {
            gateway.nameGate = CompletableDeferred()
            val viewModel = saving()

            // La respuesta llega y la sesión cambia en el mismo paso: el guardado reanuda antes de que el colector vea la
            // sesión nueva, así que solo lo frena leer la sesión vigente antes de publicar.
            gateway.nameGate?.complete(Unit)
            store.switchTo(OTHER_ACCOUNT)
            advanceUntilIdle()

            assertEquals(ProfileOutcome.Left, viewModel.state.value.outcome)
        }

    @Test
    fun `el token de otra cuenta deja la pantalla sin cerrar la sesion nueva`() =
        runTest(dispatcher) {
            gateway.termsResult = ApiResult.Failure(AppError.Network(AccountMismatchException()))
            val viewModel = saving()
            advanceUntilIdle()

            assertEquals(ProfileOutcome.Left, viewModel.state.value.outcome)
            assertEquals(0, store.signOutCalls)
            assertEquals(1, gateway.calls.size)
        }

    @Test
    fun `cerrar la sesion durante el guardado deja la pantalla sin publicar el exito`() =
        runTest(dispatcher) {
            gateway.nameGate = CompletableDeferred()
            val viewModel = saving()

            store.signOut()
            runCurrent()
            gateway.nameGate?.complete(Unit)
            advanceUntilIdle()

            assertEquals(ProfileOutcome.Left, viewModel.state.value.outcome)
        }

    @Test
    fun `sin sesion al abrir sale sin llamar a nadie`() =
        runTest(dispatcher) {
            store.signOut()
            val viewModel = opened()
            viewModel.onName("Rosa")
            viewModel.save()
            advanceUntilIdle()

            assertEquals(ProfileOutcome.Left, viewModel.state.value.outcome)
            assertTrue(gateway.calls.isEmpty())
        }

    @Test
    fun `la sugerencia de Google se precarga y se borra al usarse`() =
        runTest(dispatcher) {
            hint.offer(ACCOUNT, "Rosa Quispe")

            val viewModel = opened()

            assertEquals("Rosa Quispe", viewModel.state.value.name)
            assertTrue(viewModel.state.value.canSave)
            assertNull(hint.take(ACCOUNT))
        }

    @Test
    fun `sin sugerencia el campo abre vacio y sin error`() =
        runTest(dispatcher) {
            val state = opened().state.value

            assertEquals("", state.name)
            assertFalse(state.nameError)
            assertFalse(state.canSave)
        }

    @Test
    fun `el nombre no sale en el toString del estado`() {
        assertFalse(ProfileUiState(name = "Rosa Quispe").toString().contains("Rosa"))
    }

    private companion object {
        const val ACCOUNT = "user-1"
        const val OTHER_ACCOUNT = "user-2"
    }
}
