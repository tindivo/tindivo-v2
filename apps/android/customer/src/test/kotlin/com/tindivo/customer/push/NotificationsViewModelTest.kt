package com.tindivo.customer.push

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class MemoryPrefsStore(
    initial: NotificationPrefs = NotificationPrefs(),
) : NotificationPrefsStore {
    val flow = MutableStateFlow(initial)
    override val prefs: Flow<NotificationPrefs> = flow

    override suspend fun update(transform: (NotificationPrefs) -> NotificationPrefs) {
        flow.value = transform(flow.value)
    }
}

class FakePushSwitch(
    private val prefs: MemoryPrefsStore,
) : PushSwitch {
    val calls = mutableListOf<String>()

    override fun refresh() {
        calls += "refresh"
    }

    override suspend fun optIn() {
        calls += "optIn"
        prefs.update { it.copy(enabled = true) }
    }

    override suspend fun optOut() {
        calls += "optOut"
        prefs.update { it.copy(enabled = false) }
    }
}

/** La hoja, la franja y el interruptor (CA-NOT-01, 02, 05, 06 y 07). */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationsViewModelTest {
    private val prefs = MemoryPrefsStore()
    private val access = FakeNotificationAccess(granted = false)
    private val push = FakePushSwitch(prefs)

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel(sdk: Int = 34) = NotificationsViewModel(prefs, access, push, sdk)

    @Test
    fun `CA-NOT-01 la hoja sale con el pedido confirmado, no mientras se valida ni con el pedido terminado`() {
        val vm = viewModel()
        listOf("validando", "pending_acceptance", "awaiting_payment", "delivered", "cancelled").forEach {
            vm.onOrderStatus(it)
            assertFalse(it, vm.state.value.sheetVisible)
        }

        vm.onOrderStatus("confirmed")

        assertTrue(vm.state.value.sheetVisible)
    }

    @Test
    fun `CA-NOT-02 Ahora no cierra la hoja y no se vuelve a ofrecer`() {
        val vm = viewModel()
        vm.onOrderStatus("preparing")

        vm.decline()

        assertFalse(vm.state.value.sheetVisible)
        assertEquals(NotificationPrefs(offered = true, enabled = false), prefs.flow.value)
        viewModel().also { it.onOrderStatus("preparing") }.let { assertFalse(it.state.value.sheetVisible) }
        assertEquals(emptyList<String>(), push.calls)
    }

    @Test
    fun `Si activar en Android 13+ pide el permiso del sistema una vez y, concedido, registra`() =
        runTest {
            val vm = viewModel()
            vm.onOrderStatus("confirmed")

            vm.accept()

            assertEquals(NotificationsEvent.RequestPermission, vm.event.first())
            assertEquals(NotificationPrefs(offered = true, enabled = true, systemAsked = true), prefs.flow.value)
            access.granted = true
            vm.onPermissionResult(granted = true)
            assertEquals(listOf("refresh"), push.calls)
            assertTrue(
                vm.state.value.status
                    ?.on == true,
            )
        }

    @Test
    fun `con los avisos ya permitidos no sale la hoja y el momento queda pasado`() {
        access.granted = true

        val vm = viewModel(sdk = 30)
        vm.onOrderStatus("confirmed")

        assertFalse(vm.state.value.sheetVisible)
        assertTrue(prefs.flow.value.offered)
    }

    @Test
    fun `CA-NOT-06 el interruptor encendido da de baja y apagado vuelve a registrar`() {
        access.granted = true
        prefs.flow.value = NotificationPrefs(offered = true, enabled = true, systemAsked = true)
        val vm = viewModel()

        vm.toggle()
        assertFalse(
            vm.state.value.status
                ?.on == true,
        )
        vm.toggle()

        assertEquals(listOf("optOut", "optIn"), push.calls)
        assertTrue(
            vm.state.value.status
                ?.on == true,
        )
    }

    @Test
    fun `CA-NOT-05 con el permiso bloqueado el interruptor lleva a Ajustes y al volver concedido se enciende`() =
        runTest {
            prefs.flow.value = NotificationPrefs(offered = true, enabled = true, systemAsked = true)
            val vm = viewModel()
            assertEquals(
                BannerExit.OpenSettings,
                vm.state.value.status
                    ?.banner,
            )

            vm.toggle()
            assertEquals(NotificationsEvent.OpenSettings, vm.event.first())

            access.granted = true
            vm.onResume()
            assertTrue(
                vm.state.value.status
                    ?.on == true,
            )
            assertEquals(
                null,
                vm.state.value.status
                    ?.banner,
            )
        }
}
