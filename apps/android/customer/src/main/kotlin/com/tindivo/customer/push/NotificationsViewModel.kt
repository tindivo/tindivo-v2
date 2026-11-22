package com.tindivo.customer.push

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.customer.di.DeviceSdkInt
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** El registro visto desde la UI: reintentar, encender y apagar los avisos de este aparato (lo implementa [PushRegistrar]). */
interface PushSwitch {
    fun refresh()

    suspend fun optIn()

    suspend fun optOut()
}

/** Lo que la UI no puede hacer sola: el diálogo del sistema o los ajustes de avisos de la app. */
enum class NotificationsEvent { RequestPermission, OpenSettings }

data class NotificationsUi(
    /** `null` hasta leer lo guardado. */
    val status: NotificationStatus? = null,
    /** La hoja «¿Activar notificaciones?» sobre el detalle del pedido (CUS-NOT-001). */
    val sheetVisible: Boolean = false,
)

/**
 * Los avisos desde la UI: la hoja del primer pedido confirmado, la franja del detalle y el interruptor de Cuenta. Lo
 * del sistema se vuelve a leer en [onResume] (al volver de Ajustes, CA-NOT-05).
 */
@HiltViewModel
class NotificationsViewModel
    @Inject
    constructor(
        private val prefsStore: NotificationPrefsStore,
        private val access: NotificationAccess,
        private val push: PushSwitch,
        @param:DeviceSdkInt private val sdkInt: Int,
    ) : ViewModel() {
        private val system = MutableStateFlow(readSystem())
        private val sheet = MutableStateFlow(false)
        private val events = Channel<NotificationsEvent>(Channel.BUFFERED)

        val event: Flow<NotificationsEvent> = events.receiveAsFlow()

        val state: StateFlow<NotificationsUi> =
            combine(prefsStore.prefs, system, sheet) { prefs, sys, visible ->
                NotificationsUi(NotificationStatus.of(prefs, sys), visible)
            }.stateIn(viewModelScope, SharingStarted.Eagerly, NotificationsUi())

        fun onResume() {
            system.value = readSystem()
        }

        /** El detalle mostró un pedido con [status]: si es el momento y nunca se ofreció, sale la hoja (una sola vez). */
        fun onOrderStatus(status: String) {
            if (!pushOfferMoment(status) || sheet.value) return
            viewModelScope.launch {
                val prefs = prefsStore.current()
                if (prefs.offered) return@launch
                if (NotificationStatus.of(prefs, system.value).on) {
                    // Ya llegan (Android anterior a 13, o el permiso ya estaba): no se pregunta, pero el momento pasó.
                    prefsStore.update { it.copy(offered = true) }
                } else {
                    sheet.value = true
                }
            }
        }

        /** «Sí, activar». */
        fun accept() {
            sheet.value = false
            viewModelScope.launch {
                prefsStore.update { it.copy(offered = true) }
                turnOn()
            }
        }

        /** «Ahora no»: no se vuelve a ofrecer; queda la franja y el interruptor de Cuenta. */
        fun decline() {
            sheet.value = false
            viewModelScope.launch { prefsStore.update { it.copy(offered = true, enabled = false) } }
        }

        /** El interruptor «Avisos de tus pedidos» (CUS-NOT-002). */
        fun toggle() {
            viewModelScope.launch {
                val status = NotificationStatus.of(prefsStore.current(), system.value)
                if (status.on) push.optOut() else turnOn()
            }
        }

        /** «Abrir Ajustes» de la franja. */
        fun openSettings() {
            viewModelScope.launch { events.send(NotificationsEvent.OpenSettings) }
        }

        fun onPermissionResult(granted: Boolean) {
            system.value = readSystem()
            if (granted) push.refresh()
        }

        private suspend fun turnOn() {
            val status = NotificationStatus.of(prefsStore.current(), system.value)
            when (status.toggle()) {
                ToggleAction.TurnOff -> {
                    Unit
                }

                ToggleAction.TurnOn -> {
                    push.optIn()
                }

                ToggleAction.AskSystem -> {
                    prefsStore.update { it.copy(enabled = true, systemAsked = true) }
                    events.send(NotificationsEvent.RequestPermission)
                }

                ToggleAction.OpenSettings -> {
                    // Al volver con los avisos permitidos, quedan encendidos sin otro toque.
                    prefsStore.update { it.copy(enabled = true) }
                    events.send(NotificationsEvent.OpenSettings)
                }
            }
        }

        private fun readSystem() =
            SystemNotifications(access.permissionGranted(), access.notificationsEnabled(), sdkInt)
    }
