package com.tindivo.customer.push

import android.os.Build
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

/**
 * Cuándo se pide el permiso de avisos (Android 13+): **nunca al abrir la app**. Después de crear un pedido, si los
 * avisos están configurados y el permiso no está concedido, se muestra primero una explicación; solo si la persona
 * acepta se lanza el diálogo del sistema. Mostrada una vez (acepte o no), no se vuelve a insistir mientras viva el
 * proceso. [onGranted] vuelve a registrar el aparato (`PushRegistrar.refresh`).
 */
class PushPermissionPrompt(
    private val access: NotificationAccess,
    private val tokens: PushTokens,
    private val onGranted: () -> Unit,
    private val sdkInt: Int,
) {
    private val mutableExplain = MutableStateFlow(false)

    /** Si hay que mostrar la explicación previa ahora. */
    val explain: StateFlow<Boolean> = mutableExplain.asStateFlow()

    private var shownThisProcess = false

    /** Se acaba de crear un pedido. */
    fun onOrderCreated() {
        if (shownThisProcess || sdkInt < Build.VERSION_CODES.TIRAMISU || !tokens.enabled) return
        if (access.permissionGranted()) return
        shownThisProcess = true
        mutableExplain.value = true
    }

    /** «Ahora no», o la explicación se cerró: no se pide. */
    fun onDeclined() {
        mutableExplain.value = false
    }

    /** «Activar avisos»: la pantalla lanza el diálogo del sistema. */
    fun onAccepted() {
        mutableExplain.value = false
    }

    /** Lo que respondió el diálogo del sistema. Concedido: se registra el aparato ya. */
    fun onPermissionResult(granted: Boolean) {
        if (granted) onGranted()
    }
}

/** El puente de [PushPermissionPrompt] con la pantalla (KT-3). */
@HiltViewModel
class PushPermissionViewModel
    @Inject
    constructor(
        private val prompt: PushPermissionPrompt,
    ) : ViewModel() {
        val explain: StateFlow<Boolean> = prompt.explain

        fun onOrderCreated() = prompt.onOrderCreated()

        fun onDeclined() = prompt.onDeclined()

        fun onAccepted() = prompt.onAccepted()

        fun onPermissionResult(granted: Boolean) = prompt.onPermissionResult(granted)
    }
