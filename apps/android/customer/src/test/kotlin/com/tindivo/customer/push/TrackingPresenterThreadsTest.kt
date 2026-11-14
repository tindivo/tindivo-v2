package com.tindivo.customer.push

import com.tindivo.customer.session.FakeBackend
import com.tindivo.customer.session.SessionPublishLock
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SignInResult
import com.tindivo.customer.session.SupabaseSessionStore
import com.tindivo.customer.session.TEST_NOW
import com.tindivo.customer.session.TokenSnapshot
import com.tindivo.customer.session.testClock
import com.tindivo.customer.session.testSnapshot
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

/**
 * CAX-001 con HILOS reales (no corrutinas de prueba): el servicio de FCM pinta desde un hilo suyo y la sesión cambia
 * desde otro. El guardado de las marcas se detiene DESPUÉS de comprobar la cuenta; desde otro hilo se intenta cerrar o
 * cambiar la sesión y se comprueba que no puede colarse hasta que el aviso se haya pintado, y que lo pintado se retira
 * con la limpieza del cierre.
 */
class TrackingPresenterThreadsTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @After
    fun tearDown() {
        scope.cancel()
    }

    private class Rig(
        scope: CoroutineScope,
    ) {
        val backend =
            FakeBackend().apply {
                stored = testSnapshot("t1")
                signInResult = { TokenSnapshot("t-b", "user-b", TEST_NOW + 3600) }
            }
        val publishLock = SessionPublishLock()
        val store = SupabaseSessionStore(backend, testClock, scope, publishLock)
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val sessionAtShow = mutableListOf<SessionState>()

        val marks =
            object : MemoryMarkStore() {
                override fun save(
                    owner: String?,
                    marks: Map<String, TrackingMark>,
                ): Boolean {
                    // Ya pasó la comprobación de la cuenta: aquí otro hilo intenta cambiar la sesión.
                    entered.countDown()
                    check(release.await(WAIT_SECONDS, TimeUnit.SECONDS)) { "la prueba no liberó el guardado" }
                    return super.save(owner, marks)
                }
            }
        val notifications =
            object : FakeTrackingNotifications() {
                override fun show(
                    payload: NativePushPayload,
                    origin: TrackingOrigin,
                ) {
                    sessionAtShow += store.state.value
                    super.show(payload, origin)
                }
            }
        val installations = DataStorePushInstallationStore(MemoryDataStore(PushInstallationSnapshot()))
        val presenter =
            TrackingPresenter(store, installations, TrackingLedger(marks), notifications, publishLock)
    }

    private fun interface SessionChange {
        suspend fun run(store: SupabaseSessionStore)
    }

    private fun payload(install: String) =
        NativePushPayload(
            type = "OrderStatusChanged",
            tag = "OrderStatusChanged-AB2C3D4E",
            title = "Pedro va por tu pedido",
            body = "Lo recoge en Pollería Sabor",
            deepLink = "/pedido/AB2C3D4E",
            group = "order-AB2C3D4E",
            progress = TrackingProgress.of(2, 5),
            terminal = false,
            install = install,
            seq = 1_000_000_000_000,
        )

    private fun run(change: SessionChange) {
        val rig = Rig(scope)
        runBlocking { rig.store.state.first { it != SessionState.Unknown } }
        val install =
            runBlocking {
                rig.installations
                    .bindTo("user-1")
                    .installId
                    .toString()
            }
        val pushed = AtomicReference<Boolean?>(null)

        val pushing = thread { pushed.set(runBlocking { rig.presenter.onPush(payload(install)) }) }
        assertTrue("el guardado de las marcas no se alcanzó", rig.entered.await(WAIT_SECONDS, TimeUnit.SECONDS))
        val changing = thread { runBlocking { change.run(rig.store) } }

        // Mientras el aviso está a medias, el otro hilo NO puede haber cambiado la cuenta visible.
        Thread.sleep(HOLD_MS)
        assertEquals(SessionState.SignedIn("user-1"), rig.store.state.value)
        assertTrue(changing.isAlive)

        rig.release.countDown()
        pushing.join(JOIN_MS)
        changing.join(JOIN_MS)

        // Se pintó antes del cambio (con la cuenta de A todavía abierta), nunca después de él.
        assertEquals(true, pushed.get())
        assertEquals(listOf<SessionState>(SessionState.SignedIn("user-1")), rig.sessionAtShow)
        assertFalse(rig.store.state.value == SessionState.SignedIn("user-1"))

        // Y lo pintado de A no sobrevive al cierre: la limpieza que acompaña al cambio de cuenta lo retira.
        runBlocking { rig.presenter.closeAccount { } }
        assertTrue(rig.notifications.visible.isEmpty())
        assertTrue(rig.marks.saved.isEmpty())

        // Con la sesión ya nueva, un aviso de A que llega después no se pinta.
        val late = runBlocking { rig.presenter.onPush(payload(install)) }
        assertFalse(late)
        assertEquals(1, rig.notifications.shows.size)
    }

    @Test
    fun `cerrar la sesion desde otro hilo no se cuela entre la comprobacion y el pintado (CAX-001)`() {
        run { store -> store.signOutLocally("user-1") }
    }

    @Test
    fun `cambiar de cuenta desde otro hilo no se cuela entre la comprobacion y el pintado (CAX-001)`() {
        run { store -> assertEquals(SignInResult.Success, store.signInWithGoogle("id", "nonce")) }
    }

    private companion object {
        const val WAIT_SECONDS = 20L
        const val HOLD_MS = 400L
        const val JOIN_MS = 20_000L
    }
}
