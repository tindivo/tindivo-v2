package com.tindivo.customer.push

import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La puerta de los avisos (CAX-001, CAX-003): solo se pinta lo que es de la instalación y la sesión vigentes, y lo más
 * nuevo. El caso central: un mensaje de A ya en tránsito que llega DESPUÉS de cerrar sesión, con B abierta.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TrackingPresenterTest {
    private val session = FakeSessionStore(SessionState.SignedIn("A"))
    private val rig = PresenterRig(session)
    private val tokens = FakePushTokens()
    private val devices = FakePushDevices()
    private val order = checkNotNull(TrackingKey.parse("order-AB2C3D4E"))

    private fun TestScope.registrar(): PushRegistrar =
        PushRegistrar(
            sessionStore = session,
            installations = rig.installations,
            tokens = tokens,
            access = FakeNotificationAccess(granted = true),
            devices = devices,
            description = TestDevice,
            presenter = rig.presenter,
            scope = CoroutineScope(backgroundScope.coroutineContext + UnconfinedTestDispatcher(testScheduler)),
        ).also { it.start() }

    private fun payload(
        install: String?,
        seq: Long?,
        step: Int = 2,
        terminal: Boolean = false,
        group: String = order.group,
    ) = NativePushPayload(
        type = "OrderStatusChanged",
        tag = "OrderStatusChanged-AB2C3D4E",
        title = "Pedro va por tu pedido",
        body = "Lo recoge en Pollería Sabor",
        deepLink = order.deepLink,
        group = group,
        progress = TrackingProgress.of(step, 5).takeUnless { terminal },
        terminal = terminal,
        install = install,
        seq = seq,
    )

    private suspend fun installId() = checkNotNull(rig.installations.current()).installId

    @Test
    fun `un aviso de la instalacion y la sesion vigentes se pinta`() =
        runTest {
            registrar()

            assertTrue(rig.presenter.onPush(payload(installId(), seq = 1_000_000_000_000)))

            assertEquals(1, rig.notifications.shows.size)
            assertEquals(
                TrackingOrigin.Push,
                rig.notifications.shows
                    .single()
                    .second,
            )
        }

    @Test
    fun `un aviso sin install o con el install de otra instalacion se descarta`() =
        runTest {
            registrar()

            assertFalse(rig.presenter.onPush(payload(install = null, seq = 1_000_000_000_000)))
            assertFalse(rig.presenter.onPush(payload(install = "otra-instalacion-cualquiera", seq = 1_000_000_000_000)))

            assertTrue(rig.notifications.shows.isEmpty())
        }

    @Test
    fun `un mensaje de A en transito, pintado despues de cerrar sesion y con B abierta, se descarta`() =
        runTest {
            val registrar = registrar()
            val installOfA = installId()
            val inTransit = payload(installOfA, seq = 1_000_000_000_000)

            // A cierra sesión: la identidad cambia y la bandeja se vacía, todo antes de que llegue el mensaje.
            registrar.beforeSignOut("A")
            session.signOutIf("A")
            session.switchTo("B")

            // El mensaje que ya iba en camino llega ahora, con B abierta y registrada.
            assertEquals("B", rig.installations.current()?.accountId)
            assertFalse(rig.presenter.onPush(inTransit))

            assertTrue(rig.notifications.shows.isEmpty())
            assertTrue(rig.notifications.visible.isEmpty())
            // Y uno de B, con su propio install, sí.
            assertTrue(rig.presenter.onPush(payload(installId(), seq = 2_000_000_000_000)))
        }

    @Test
    fun `el mismo mensaje en transito tambien se descarta tras una sesion cerrada sola y con el proceso nuevo`() =
        runTest {
            val registrar = registrar()
            val inTransit = payload(installId(), seq = 1_000_000_000_000)
            session.switchToSignedOut()
            assertNotEquals(inTransit.install, installId())

            // «Proceso nuevo»: otra puerta sobre los mismos datos en disco.
            val fresh =
                TrackingPresenter(session, rig.installations, TrackingLedger(rig.marks), FakeTrackingNotifications())

            assertFalse(fresh.onPush(inTransit))
            registrar.refresh()
            assertFalse(fresh.onPush(inTransit))
        }

    @Test
    fun `cerrar sesion vacia la bandeja y las marcas en el mismo paso que cambia la identidad`() =
        runTest {
            val registrar = registrar()
            rig.presenter.onPush(payload(installId(), seq = 5_000_000_000_000, terminal = true))
            assertTrue(rig.marks.saved.isNotEmpty())
            val clearsBefore = rig.notifications.clears

            registrar.beforeSignOut("A")

            assertEquals(clearsBefore + 1, rig.notifications.clears)
            assertTrue(rig.marks.saved.isEmpty())
            assertEquals(null, rig.installations.current()?.accountId)
        }

    @Test
    fun `avisos desordenados no retroceden la barra ni reviven la de un pedido terminado`() =
        runTest {
            registrar()
            val install = installId()

            assertTrue(rig.presenter.onPush(payload(install, seq = 3_000_000_000_000, step = 4)))
            // El del paso 3 (más viejo) llega después.
            assertFalse(rig.presenter.onPush(payload(install, seq = 2_000_000_000_000, step = 3)))
            assertTrue(rig.presenter.onPush(payload(install, seq = 4_000_000_000_000, terminal = true)))
            // Un activo tardío, aunque traiga una versión mayor por error de reloj, no revive la barra.
            assertFalse(rig.presenter.onPush(payload(install, seq = 5_000_000_000_000, step = 4)))

            assertEquals(2, rig.notifications.shows.size)
            assertTrue(
                rig.notifications.shows
                    .last()
                    .first.terminal,
            )
        }

    @Test
    fun `un aviso que no es de seguimiento no pasa por las marcas pero tambien exige la instalacion vigente`() =
        runTest {
            registrar()
            val other = payload(installId(), seq = null, group = "OrderProofRejected-AB2C3D4E")

            assertTrue(rig.presenter.onPush(other))
            assertTrue(rig.presenter.onPush(other))
            assertFalse(rig.presenter.onPush(other.copy(install = "otra-instalacion-cualquiera")))
            assertTrue(rig.marks.saved.isEmpty())
        }

    @Test
    fun `la puesta al dia no actua si llego un aviso o cambio la cuenta desde que se planeo`() =
        runTest {
            registrar()
            val seen = rig.presenter.version()
            val generation = session.signInGeneration.value
            rig.notifications.visible[order] = TrackingProgress.of(2, 5)
            rig.presenter.onPush(payload(installId(), seq = 1_000_000_000_000, step = 3))
            val remove = listOf<ReconcileAction>(ReconcileAction.Remove(order))

            rig.presenter.apply("A", generation, seen, remove) { _, _ -> error("no debe pintar") }
            assertTrue(rig.notifications.removes.isEmpty())

            val now = rig.presenter.version()
            rig.presenter.apply("B", generation, now, remove) { _, _ -> error("no debe pintar") }
            assertTrue(rig.notifications.removes.isEmpty())

            rig.presenter.apply("A", generation, now, remove) { _, _ -> error("no debe pintar") }
            assertEquals(listOf(order), rig.notifications.removes)
        }

    /** Una puerta cuya lectura de la instalacion se puede detener a mitad: es la suspension que Codex senalo. */
    private class GatedRig(
        session: FakeSessionStore,
    ) {
        val gated = GatedInstallations(DataStorePushInstallationStore(MemoryDataStore(PushInstallationSnapshot())))
        val rig = PresenterRig(session, installations = gated)
    }

    private fun payloadOf(
        install: String,
        seq: Long?,
        step: Int = 2,
        terminal: Boolean = false,
    ) = payload(install, seq, step, terminal)

    // CAX-001
    @Test
    fun `si la sesion se cierra mientras se lee la instalacion, no se pinta nada (CAX-001)`() =
        runTest {
            val g = GatedRig(session)
            val install =
                g.gated
                    .bindTo("A")
                    .installId
                    .toString()
            g.gated.gate = CompletableDeferred()

            val pushing =
                launch(start = CoroutineStart.UNDISPATCHED) {
                    assertFalse(g.rig.presenter.onPush(payloadOf(install, seq = 1_000_000_000_000)))
                }
            g.gated.reading.await()
            session.switchToSignedOut()
            session.switchTo("B")
            g.gated.gate?.complete(Unit)
            pushing.join()

            assertTrue(
                g.rig.notifications.shows
                    .isEmpty(),
            )
            assertTrue(
                g.rig.marks.saved
                    .isEmpty(),
            )
        }

    @Test
    fun `A a B y otra vez A durante la lectura tampoco pinta, es otra sesion (CAX-001)`() =
        runTest {
            val g = GatedRig(session)
            val install =
                g.gated
                    .bindTo("A")
                    .installId
                    .toString()
            g.gated.gate = CompletableDeferred()

            val pushing =
                launch(start = CoroutineStart.UNDISPATCHED) {
                    assertFalse(g.rig.presenter.onPush(payloadOf(install, seq = 1_000_000_000_000)))
                }
            g.gated.reading.await()
            session.switchTo("B")
            session.switchTo("A")
            g.gated.gate?.complete(Unit)
            pushing.join()

            assertTrue(
                g.rig.notifications.shows
                    .isEmpty(),
            )
        }

    @Test
    fun `sin cambio de sesion durante la lectura el aviso se pinta`() =
        runTest {
            val g = GatedRig(session)
            val install =
                g.gated
                    .bindTo("A")
                    .installId
                    .toString()
            g.gated.gate = CompletableDeferred()

            val pushing =
                launch(start = CoroutineStart.UNDISPATCHED) {
                    assertTrue(g.rig.presenter.onPush(payloadOf(install, seq = 1_000_000_000_000)))
                }
            g.gated.reading.await()
            g.gated.gate?.complete(Unit)
            pushing.join()

            assertEquals(1, g.rig.notifications.shows.size)
        }

    // CAX-003
    @Test
    fun `un aviso de seguimiento sin version o con una invalida no se pinta (CAX-003)`() =
        runTest {
            registrar()

            assertFalse(rig.presenter.onPush(payload(installId(), seq = null)))
            assertFalse(rig.presenter.onPush(payload(installId(), seq = 0)))
            assertFalse(rig.presenter.onPush(payload(installId(), seq = -1)))

            assertTrue(rig.notifications.shows.isEmpty())
        }

    @Test
    fun `un aviso con la misma version no se pinta otra vez, el terminal mas nuevo gana (CAX-003)`() =
        runTest {
            registrar()
            val install = installId()

            assertTrue(rig.presenter.onPush(payload(install, seq = 2_000_000_000_000, step = 4)))
            assertFalse("el mismo estado, duplicado", rig.presenter.onPush(payload(install, 2_000_000_000_000, 4)))
            assertTrue(rig.presenter.onPush(payload(install, seq = 3_000_000_000_000, terminal = true)))
            assertFalse(rig.presenter.onPush(payload(install, seq = 3_000_000_000_000, step = 4)))

            assertEquals(2, rig.notifications.shows.size)
        }

    @Test
    fun `si cerrar sesion no puede guardar la identidad, la bandeja y las marcas se limpian igual (CAX-010)`() =
        runTest {
            rig.presenter.onPush(payload("x", seq = 1_000_000_000_000))
            val clearsBefore = rig.notifications.clears

            val failure =
                runCatching {
                    rig.presenter.closeAccount { throw java.io.IOException("disco lleno") }
                }.exceptionOrNull()

            assertTrue(failure is java.io.IOException)
            assertEquals(clearsBefore + 1, rig.notifications.clears)
            assertTrue(rig.marks.saved.isEmpty())
        }

    private fun barless(install: String) = payload(install, seq = null).copy(progress = null)

    @Test
    fun `un aviso del grupo del pedido sin paso ni version se muestra como antes y no toca las marcas`() =
        runTest {
            registrar()

            assertTrue(rig.presenter.onPush(barless(installId())))

            assertEquals(1, rig.notifications.shows.size)
            assertTrue(rig.marks.saved.isEmpty())
        }

    @Test
    fun `el mismo aviso con paso y sin version se descarta`() =
        runTest {
            registrar()

            assertFalse(rig.presenter.onPush(barless(installId()).copy(progress = TrackingProgress.of(2, 5))))
            assertFalse(rig.presenter.onPush(barless(installId()).copy(terminal = true)))

            assertTrue(rig.notifications.shows.isEmpty())
        }

    @Test
    fun `un aviso sin barra tras un terminal se muestra, no revive la barra ni cambia las marcas`() =
        runTest {
            registrar()
            val install = installId()
            assertTrue(rig.presenter.onPush(payload(install, seq = 5_000_000_000_000, terminal = true)))
            val marks = rig.marks.saved

            assertTrue(rig.presenter.onPush(barless(install)))

            assertEquals(marks, rig.marks.saved)
            assertFalse(rig.presenter.onPush(payload(install, seq = 6_000_000_000_000, step = 4)))
        }

    // CAX-003 (a): un aviso viejo sin barra no sustituye la notificacion fija del mismo pedido.
    @Test
    fun `un aviso viejo sin barra del mismo pedido no sustituye la notificacion fija (CAX-003)`() =
        runTest {
            registrar()
            val install = installId()
            assertTrue(rig.presenter.onPush(payload(install, seq = 5_000_000_000_000, step = 3)))
            val pinned = rig.notifications.visible[order]

            val old = barless(install)
            assertTrue(rig.presenter.onPush(old))

            assertEquals("la fija sigue donde estaba", pinned, rig.notifications.visible[order])
            assertNotEquals(order.group, notificationTag(old))
            assertEquals("OrderStatusChanged-AB2C3D4E", notificationTag(old))
            assertTrue(rig.presenter.shown().any { it.key == order })
        }

    @Test
    fun `solo el aviso que mueve el seguimiento usa la etiqueta fija, el resto una etiqueta disjunta (CAX-003)`() {
        val moving = payload("x", seq = 1_000_000_000_000, step = 2)
        assertEquals("tracking:order-AB2C3D4E", notificationTag(moving))
        assertEquals(trackingTag(order), notificationTag(moving.copy(progress = null, terminal = true)))
        assertEquals(order, trackingKeyOfTag(notificationTag(moving)))
        // Un aviso que no es del seguimiento ya tiene su grupo propio.
        val other = barless("x").copy(group = "OrderProofRejected-AB2C3D4E", tag = "OrderProofRejected-AB2C3D4E")
        assertEquals("OrderProofRejected-AB2C3D4E", notificationTag(other))
        assertNull(trackingKeyOfTag(notificationTag(other)))
        // Un grupo que imitara la etiqueta fija se desplaza.
        val imitation = other.copy(group = trackingTag(order), tag = trackingTag(order))
        assertEquals("event:tracking:order-AB2C3D4E", notificationTag(imitation))
        assertNull(trackingKeyOfTag(notificationTag(imitation)))
    }

    @Test
    fun `el caso de Codex (type order, tag y group order-AB2C3D4E, sin barra) no reconstruye la fija (CAX-003)`() =
        runTest {
            registrar()
            val install = installId()
            assertTrue(rig.presenter.onPush(payload(install, seq = 5_000_000_000_000, step = 3)))
            val pinned = rig.notifications.visible[order]
            val data =
                mapOf(
                    "v" to "1",
                    "type" to "order",
                    "tag" to "order-AB2C3D4E",
                    "group" to "order-AB2C3D4E",
                    "title" to "T",
                    "body" to "B",
                    "deepLink" to "/pedido/AB2C3D4E",
                    "install" to install,
                )
            val hostile = checkNotNull(NativePushPayload.decode(data))

            assertNotEquals(trackingTag(order), notificationTag(hostile))
            assertNull(trackingKeyOfTag(notificationTag(hostile)))
            assertTrue(rig.presenter.onPush(hostile))
            assertEquals("la fija sigue donde estaba", pinned, rig.notifications.visible[order])
        }

    // CAX-003 (b): la puesta al dia no impide un retroceso legitimo posterior (piso = updatedAt de REST).
    @Test
    fun `tras la puesta al dia, un release posterior al updatedAt se pinta y uno anterior no (CAX-003)`() =
        runTest {
            registrar()
            val install = installId()
            val courier = checkNotNull(TrackingKey.parse("courier-ZZ9Y8X7W"))
            val read = 2_000_000_000_000L // el updatedAt que trajo REST
            assertTrue(rig.presenter.onPush(payload(install, seq = read - 60_000, step = 2, group = courier.group)))
            val status =
                TrackingStatus.Active(TrackingKind.Courier, checkNotNull(TrackingProgress.of(3, 4)), version = read)

            rig.presenter.apply(
                "A",
                session.signInGeneration.value,
                rig.presenter.version(),
                listOf(ReconcileAction.Update(courier, TrackingProgress.of(2, 5), status)),
            ) { _, _ -> payload(install, seq = null, step = 3, group = courier.group) }

            val earlier = payload(install, read - 30_000, 2, group = courier.group)
            assertFalse("un aviso anterior a lo que leyo REST", rig.presenter.onPush(earlier))
            val release = payload(install, seq = read + 1, step = 1, group = courier.group)
            assertTrue("la entrega soltada despues de la consulta", rig.presenter.onPush(release))
            assertEquals(TrackingProgress.of(1, 5), rig.notifications.visible[courier])
        }

    // CAX-003 (c): si las marcas no se pueden escribir, no se pinta.
    @Test
    fun `si las marcas no se pueden escribir el aviso no se pinta y se admite cuando vuelve el disco (CAX-003)`() =
        runTest {
            registrar()
            val first = payload(installId(), seq = 1_000_000_000_000)
            rig.marks.writeWorks = false

            assertFalse(rig.presenter.onPush(first))
            assertTrue(rig.notifications.shows.isEmpty())
            assertTrue(rig.marks.saved.isEmpty())

            rig.marks.writeWorks = true
            assertTrue(rig.presenter.onPush(first))
            assertEquals(1, rig.notifications.shows.size)
        }

    // CAX-003 caso 1: T0 < T1 < T2; el paso que lee REST no cambia pero su version si.
    @Test
    fun `una lectura REST sin cambio de paso sube la version y un aviso anterior ya no se pinta (CAX-003)`() =
        runTest {
            registrar()
            val install = installId()
            val courier = checkNotNull(TrackingKey.parse("courier-ZZ9Y8X7W"))
            val t0 = 1_000_000_000_000L
            val t1 = 2_000_000_000_000L
            val t2 = 3_000_000_000_000L
            assertTrue(rig.presenter.onPush(payload(install, seq = t0, step = 2, group = courier.group)))
            val status = TrackingStatus.Active(TrackingKind.Courier, checkNotNull(TrackingProgress.of(2, 5)), t2)

            rig.presenter.apply(
                "A",
                session.signInGeneration.value,
                rig.presenter.version(),
                listOf(ReconcileAction.Observe(courier, status)),
            ) { _, _ -> error("no debe pintar") }

            assertFalse(
                "el push viejo del paso 2 en T1",
                rig.presenter.onPush(payload(install, t1, 2, group = courier.group)),
            )
            assertEquals(1, rig.notifications.shows.size)
        }

    @Test
    fun `una lectura REST mas vieja que lo ya observado no sustituye lo que se muestra (CAX-003)`() =
        runTest {
            registrar()
            val install = installId()
            val courier = checkNotNull(TrackingKey.parse("courier-ZZ9Y8X7W"))
            assertTrue(rig.presenter.onPush(payload(install, seq = 5_000_000_000_000, step = 3, group = courier.group)))
            val stale =
                TrackingStatus.Active(
                    TrackingKind.Courier,
                    checkNotNull(TrackingProgress.of(2, 4)),
                    4_000_000_000_000,
                )

            rig.presenter.apply(
                "A",
                session.signInGeneration.value,
                rig.presenter.version(),
                listOf(ReconcileAction.Update(courier, TrackingProgress.of(3, 5), stale)),
            ) { _, _ -> error("no debe pintar") }

            assertEquals(TrackingProgress.of(3, 5), rig.notifications.visible[courier])
        }

    // CAX-003 caso 2: llega primero el posterior y luego el anterior con el mismo seq.
    @Test
    fun `con el mismo seq y otro estado no se pinta el anterior y se pide REST de ese grupo (CAX-003)`() =
        runTest {
            registrar()
            val install = installId()
            val requests = mutableListOf<String>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                rig.presenter.reconcileRequests.collect { requests += it }
            }
            val seq = 4_000_000_000_000L

            assertTrue("el posterior (paso 3) llega primero", rig.presenter.onPush(payload(install, seq, step = 3)))
            assertFalse("el anterior (paso 2), mismo seq", rig.presenter.onPush(payload(install, seq, step = 2)))

            assertEquals("sigue visible el posterior", TrackingProgress.of(3, 5), rig.notifications.visible[order])
            assertEquals(1, rig.notifications.shows.size)
            assertEquals(listOf(order.group), requests)
            // Un duplicado exacto no pide nada.
            assertFalse(rig.presenter.onPush(payload(install, seq, step = 3)))
            assertEquals(1, requests.size)
        }

    // CAX-003 caso 3: cerrar sesion nunca se bloquea por un disco que no escribe las marcas.
    @Test
    fun `cerrar sesion termina aunque las marcas no se puedan escribir y limpia la bandeja (CAX-003)`() =
        runTest {
            registrar()
            assertTrue(rig.presenter.onPush(payload(installId(), seq = 1_000_000_000_000, step = 2)))
            rig.marks.writeWorks = false

            rig.presenter.closeAccount { Unit }

            assertTrue(rig.notifications.visible.isEmpty())
            assertEquals(1, rig.notifications.clears)
        }
}
