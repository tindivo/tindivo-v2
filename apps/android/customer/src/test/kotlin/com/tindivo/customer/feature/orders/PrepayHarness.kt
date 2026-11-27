package com.tindivo.customer.feature.orders

import androidx.lifecycle.SavedStateHandle
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.rules.Timeout
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * Lo común a las pruebas de la sección de pago: Main en un [StandardTestDispatcher] (nada corre hasta que la prueba lo
 * pide con `runCurrent` o `advanceTimeBy`), gateway y codificador falsos, y un reloj que avanza con el tiempo virtual
 * del planificador: la cuenta regresiva se prueba sin esperar de verdad.
 */
@OptIn(ExperimentalCoroutinesApi::class)
abstract class PrepayHarness {
    /**
     * Una prueba que se cuelga falla en vez de bloquear la corrida: con el tiempo virtual de `runTest`, una consulta
     * periódica que nadie cancela avanza sin fin (pasó el 2026-11-27 y dejó una JVM de pruebas colgada).
     */
    @get:Rule
    val hangGuard: Timeout = Timeout.seconds(HANG_GUARD_SECONDS)

    protected val dispatcher = StandardTestDispatcher()
    protected lateinit var configService: ConfigService

    @Before
    fun setUpMain() {
        Dispatchers.setMain(dispatcher)
        // La sección solo le avisa un 426; nunca lee `/config`, así que el servidor no hace falta.
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                retry =
                    RetryInterceptor(sleeper = {
                        _,
                        _,
                        ->
                    }),
            )
        configService =
            ConfigService(
                SystemRepository("http://127.0.0.1:9/api/v1", client, dispatcher),
                "0.1.0",
                CoroutineScope(dispatcher),
            )
    }

    @After
    fun tearDownMain() {
        Dispatchers.resetMain()
    }

    /** Un ViewModel recién creado con sus falsos; [seen] guarda cada estado publicado, en orden. */
    internal inner class Env(
        private val scope: TestScope,
        session: SessionState = SessionState.SignedIn(PREPAY_ACCOUNT),
        orderId: String? = ORDER_ID.toString(),
        observe: Boolean = true,
    ) {
        val gates = StepGates()
        val gateway = FakePrepayGateway(gates)
        val encoder = FakeProofEncoder(gates)
        val store = FakeSessionStore(session)
        val viewModel =
            PrepayViewModel(
                SavedStateHandle(mapOf("id" to orderId)),
                gateway,
                encoder,
                store,
                configService,
                SchedulerClock(scope.testScheduler),
                PollingDelay { delay(it) },
            )
        val seen = mutableListOf<PrepayUiState>()

        private var collector: Job? = null

        init {
            if (observe) startObserving()
        }

        /** Alguien empieza a mirar `state` (la pantalla a la vista). */
        fun startObserving() {
            if (collector?.isActive == true) return
            collector =
                scope.backgroundScope.launch(UnconfinedTestDispatcher(scope.testScheduler)) {
                    viewModel.state.collect { seen += it }
                }
        }

        /** Nadie mira `state` (la pantalla en segundo plano: `collectAsStateWithLifecycle` se desuscribe). */
        fun stopObserving() {
            collector?.cancel()
            collector = null
        }

        val state: PrepayUiState
            get() = viewModel.state.value
    }

    /** La sección lista para enviar: `prepay-info` cargado (sin cuenta regresiva) y la foto [photo] elegida. */
    internal fun TestScope.readyToSend(photo: String = PHOTO_A): Env {
        val env = Env(this)
        env.viewModel.load()
        runCurrent()
        env.viewModel.onPhotoPicked(photo)
        return env
    }

    /** Un reloj que marca [start] más el tiempo virtual que lleva el planificador. */
    protected class SchedulerClock(
        private val scheduler: TestCoroutineScheduler,
        private val start: Instant = NOW,
    ) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC

        override fun withZone(zone: ZoneId): Clock = this

        override fun instant(): Instant = start.plusMillis(scheduler.currentTime)
    }

    companion object {
        val NOW: Instant = Instant.parse("2026-11-10T15:00:00Z")
        const val PHOTO_A = "content://media/picker/0/foto-a"
        const val PHOTO_B = "content://media/picker/0/foto-b"
    }
}

private const val HANG_GUARD_SECONDS = 60L
