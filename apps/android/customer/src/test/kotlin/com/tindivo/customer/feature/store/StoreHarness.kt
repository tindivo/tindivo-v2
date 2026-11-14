package com.tindivo.customer.feature.store

import com.tindivo.core.network.AppError
import com.tindivo.core.network.SystemRepository
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Before

/**
 * Lo común a las pruebas de los ViewModels de Store: `Main` de prueba (y su reloj virtual, que `runTest` comparte), un
 * servidor falso y los eventos anotados. La configuración no llama nunca a la red: solo recibe el aviso de un 426.
 */
@OptIn(ExperimentalCoroutinesApi::class)
abstract class StoreHarness {
    protected val dispatcher = UnconfinedTestDispatcher()
    internal val gateway = FakeStoreGateway()
    internal val sender = RecordingSender()
    internal val events = storeEvents(sender, CoroutineScope(dispatcher))
    protected val config =
        ConfigService(
            SystemRepository("http://localhost/api/v1", OkHttpClient(), dispatcher),
            "0.1.0",
            CoroutineScope(dispatcher),
        )

    @Before
    fun setMainDispatcher() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun resetMainDispatcher() {
        Dispatchers.resetMain()
    }

    protected fun upgradeRequired() = AppError.UpgradeRequired("1.2.0")

    protected fun upgradeReported(): Boolean = config.state.value == ConfigState.UpgradeRequired("1.2.0")
}
