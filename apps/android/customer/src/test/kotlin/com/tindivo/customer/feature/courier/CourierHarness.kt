package com.tindivo.customer.feature.courier

import com.tindivo.core.network.AppError
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

internal const val ACCOUNT_A = "user-a"
internal const val ACCOUNT_B = "user-b"

/** Lo común a las pruebas de los ViewModels de Entregas: `Main` de prueba, un servidor falso y la sesión de A. */
@OptIn(ExperimentalCoroutinesApi::class)
abstract class CourierHarness {
    protected val dispatcher = UnconfinedTestDispatcher()
    internal val gateway = FakeCourierGateway()
    protected val session = FakeSessionStore(SessionState.SignedIn(ACCOUNT_A))
    protected val config: ConfigService = offlineConfig(dispatcher)

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

/** Un reloj que avanza con el tiempo virtual de la prueba y cuenta cuántas veces se le preguntó la hora. */
internal class VirtualClock(
    private val start: Instant,
    private val now: () -> Long,
) : Clock() {
    var reads = 0
        private set

    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId?): Clock = this

    override fun instant(): Instant {
        reads++
        return start.plusMillis(now())
    }
}
