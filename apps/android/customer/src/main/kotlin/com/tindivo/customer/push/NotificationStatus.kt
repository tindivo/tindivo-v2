package com.tindivo.customer.push

import android.os.Build

/** Lo que dice el sistema ahora: el permiso (Android 13+), si los avisos de la app están permitidos y la versión. */
data class SystemNotifications(
    val permissionGranted: Boolean,
    val notificationsEnabled: Boolean,
    val sdkInt: Int,
)

/** Qué hace el interruptor «Avisos de tus pedidos» al tocarlo (CUS-NOT-002). */
enum class ToggleAction {
    /** Encendido: se apaga (baja en el servidor y preferencia guardada). */
    TurnOff,

    /** Apagado por la persona y el sistema lo permite: se vuelve a registrar, sin diálogo. */
    TurnOn,

    /** El diálogo del sistema nunca se mostró (Android 13+): se pide una vez. */
    AskSystem,

    /** El sistema ya no deja preguntar, o los avisos están apagados en los ajustes de la app: se abre Ajustes. */
    OpenSettings,
}

/** La salida de la franja «Notificaciones desactivadas» (CUS-NOT-003). */
enum class BannerExit { OpenSettings, OpenAccount }

/**
 * El estado EFECTIVO de los avisos: el permiso, los ajustes del sistema y la preferencia guardada, juntos. Una función
 * pura, para probarla sin Android. [on] es lo que muestra el interruptor; [toggle], lo que hace al tocarlo; [banner],
 * la franja del detalle del pedido (`null` = sin franja).
 */
class NotificationStatus private constructor(
    private val prefs: NotificationPrefs,
    private val system: NotificationsSystemView,
) {
    val on: Boolean get() = system.allowed && prefs.enabled

    fun toggle(): ToggleAction =
        when {
            on -> ToggleAction.TurnOff
            system.allowed -> ToggleAction.TurnOn
            system.canAsk(prefs) -> ToggleAction.AskSystem
            else -> ToggleAction.OpenSettings
        }

    /** Solo después de ofrecer la hoja: antes, la hoja es la única pregunta (si no, el primer pedido vería las dos). */
    val banner: BannerExit?
        get() =
            when {
                on || !prefs.offered -> null
                !system.allowed && !system.canAsk(prefs) -> BannerExit.OpenSettings
                else -> BannerExit.OpenAccount
            }

    companion object {
        fun of(
            prefs: NotificationPrefs,
            system: SystemNotifications,
        ): NotificationStatus = NotificationStatus(prefs, NotificationsSystemView(system))
    }
}

private class NotificationsSystemView(
    private val system: SystemNotifications,
) {
    /** El sistema deja mostrar avisos a la app. */
    val allowed: Boolean get() = system.permissionGranted && system.notificationsEnabled

    /** Se puede mostrar el diálogo del sistema: Android 13+, sin permiso y sin haberlo pedido antes. */
    fun canAsk(prefs: NotificationPrefs): Boolean =
        system.sdkInt >= Build.VERSION_CODES.TIRAMISU && !system.permissionGranted && !prefs.systemAsked
}
