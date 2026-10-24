package com.tindivo.customer.feature.update

import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class UpdateViewModelTest {
    private val dispatcher = UnconfinedTestDispatcher()

    // El ConfigService nunca llama a la red aquí: solo se le avisa con reportUpgradeRequired.
    private val configService =
        ConfigService(
            system =
                SystemRepository(
                    baseUrl = "http://localhost/api/v1",
                    client = createOkHttpClient(ClientInfo("customer", "0.1.0", "1")),
                    ioDispatcher = dispatcher,
                ),
            appVersion = "0.1.0",
            scope = CoroutineScope(dispatcher),
        )

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `sin aviso previo no hay version minima`() =
        runTest {
            assertEquals(UpdateUiState(minVersion = null), UpdateViewModel(configService).state.value)
        }

    @Test
    fun `muestra la minima que ya estaba en el ConfigService`() =
        runTest {
            configService.reportUpgradeRequired("1.2.0")

            assertEquals(UpdateUiState(minVersion = "1.2.0"), UpdateViewModel(configService).state.value)
        }

    @Test
    fun `sigue al ConfigService cuando llega la minima despues`() =
        runTest {
            val viewModel = UpdateViewModel(configService)

            configService.reportUpgradeRequired("1.4.0")

            assertEquals(UpdateUiState(minVersion = "1.4.0"), viewModel.state.value)
        }
}
