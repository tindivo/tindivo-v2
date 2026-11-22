package com.tindivo.customer.feature.terms

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
import com.tindivo.customer.feature.profile.FakeProfileGateway
import com.tindivo.customer.feature.profile.TERMS_VERSION
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** CAX-001: la pantalla de aceptación de una sesión del formato anterior registra con `acceptTerms` y solo entonces confirma. */
@OptIn(ExperimentalCoroutinesApi::class)
class TermsGateViewModelTest {
    private val dispatcher = UnconfinedTestDispatcher()
    private val store = FakeSessionStore(SessionState.SignedIn("user-1"))
    private val profiles = FakeProfileGateway()
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

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        store.termsRequiredState.value = true
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel() = TermsGateViewModel(store, profiles, configService)

    @Test
    fun `CA-AUT-13 aceptar registra la version vigente y despues confirma la sesion`() =
        runTest {
            val vm = viewModel()

            vm.accept()

            assertEquals(listOf("terms:$TERMS_VERSION:user-1"), profiles.calls)
            assertEquals(listOf("user-1"), store.confirmTermsCalls)
            assertEquals(TermsGateUiState.Idle, vm.state.value)
        }

    @Test
    fun `CA-AUT-13 si el registro falla no se confirma, sigue el bloqueo y la sesion no se cierra`() =
        runTest {
            profiles.termsResult = ApiResult.Failure(AppError.Known(ApiErrorCode.InternalError, 500, null))
            val vm = viewModel()

            vm.accept()

            assertTrue(store.confirmTermsCalls.isEmpty())
            assertEquals(TermsGateUiState.Failed, vm.state.value)
            assertTrue(store.termsRequired.value)
            assertTrue(store.signOutIfCalls.isEmpty())
        }

    @Test
    fun `CA-AUT-13 sin red no se confirma y se puede reintentar`() =
        runTest {
            profiles.termsResult = ApiResult.Failure(AppError.Network(java.io.IOException("sin red")))
            val vm = viewModel()

            vm.accept()
            assertEquals(TermsGateUiState.Failed, vm.state.value)

            profiles.termsResult = ApiResult.Success(Unit)
            vm.accept()

            assertEquals(listOf("user-1"), store.confirmTermsCalls)
            assertEquals(TermsGateUiState.Idle, vm.state.value)
        }

    @Test
    fun `CA-AUT-13 un 426 al registrar lleva al flujo de actualizar la app`() =
        runTest {
            profiles.termsResult = ApiResult.Failure(AppError.UpgradeRequired("2.0.0"))
            val vm = viewModel()

            vm.accept()

            assertEquals(ConfigState.UpgradeRequired("2.0.0"), configService.state.value)
            assertTrue(store.confirmTermsCalls.isEmpty())
        }

    @Test
    fun `CA-AUT-13 cerrar sesion cierra solo la de esta cuenta`() =
        runTest {
            val vm = viewModel()

            vm.signOut()

            assertEquals(listOf("user-1"), store.signOutIfCalls)
        }

    @Test
    fun `CA-AUT-13 sin cuenta no hay nada que aceptar`() =
        runTest {
            store.switchToSignedOut()
            val vm = viewModel()

            vm.accept()

            assertTrue(profiles.calls.isEmpty())
        }
}
