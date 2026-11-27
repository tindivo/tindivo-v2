package com.tindivo.customer.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.tindivo.customer.MainActivity
import com.tindivo.customer.R
import java.net.URLEncoder

/**
 * El canal de los avisos del pedido (KT-10). Es el ÚNICO: en el lanzamiento no hay avisos de promociones, tampoco como
 * canal en los ajustes (CUS-NOT-006). Su id es el `FCM_CHANNEL_ID` de `supabase/functions/send-push/native.ts`. Es
 * estable: una vez creado, su importancia la controla el usuario.
 */
object PushChannels {
    const val ORDER_UPDATES = "order_updates"

    /** Todos los canales que crea la app. */
    val ALL: List<String> = listOf(ORDER_UPDATES)

    /** Crea el canal al arrancar. Crearlo no pide el permiso de avisos (eso solo pasa con `targetSdk` < 33). */
    fun create(context: Context) {
        val channel =
            NotificationChannel(
                ORDER_UPDATES,
                context.getString(R.string.push_channel_orders),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply { description = context.getString(R.string.push_channel_orders_description) }
        context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }
}

/** [NotificationAccess] del sistema. [sdkInt] se inyecta para poder probar sin Robolectric. */
class AndroidNotificationAccess(
    private val context: Context,
    private val sdkInt: Int,
) : NotificationAccess {
    override fun permissionGranted(): Boolean =
        sdkInt < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    /** Avisos de la app permitidos Y el canal de pedidos sin bloquear: apagar solo el canal también es «apagados». */
    override fun notificationsEnabled(): Boolean {
        val manager = NotificationManagerCompat.from(context)
        val channel = manager.getNotificationChannelCompat(PushChannels.ORDER_UPDATES)
        return manager.areNotificationsEnabled() && channel?.importance != NotificationManagerCompat.IMPORTANCE_NONE
    }
}

/**
 * Pinta los avisos (llegan solo-datos: el sistema no los pinta). La identidad en la bandeja es (etiqueta = tag, id = 0):
 * un aviso con el mismo tag reemplaza al anterior. Al tocarlo abre la app con la versión y la ruta, nada más.
 */
class PushNotifier(
    private val context: Context,
) : PushNotifications {
    override fun show(payload: NativePushPayload) {
        val manager = NotificationManagerCompat.from(context)
        if (!canPost(manager)) return
        val notification =
            NotificationCompat
                .Builder(context, PushChannels.ORDER_UPDATES)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(ContextCompat.getColor(context, R.color.push_accent))
                .setContentTitle(payload.title)
                .setContentText(payload.body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(payload.body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setAutoCancel(true)
                .setContentIntent(contentIntent(payload))
                .build()
        try {
            manager.notify(payload.tag, NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
            // El permiso se revocó entre la comprobación y el aviso: no se muestra.
        }
    }

    override fun clearAll() {
        NotificationManagerCompat.from(context).cancelAll()
    }

    private fun canPost(manager: NotificationManagerCompat): Boolean =
        manager.areNotificationsEnabled() &&
            (
                Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                    PackageManager.PERMISSION_GRANTED
            )

    private fun contentIntent(payload: NativePushPayload): PendingIntent {
        val open =
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                // La identidad del PendingIntent: el tag ENTERO (CAX-005, ver [notificationIdentity]).
                data = Uri.parse(notificationIdentity(payload.tag))
                // Solo lo necesario para navegar (versión y ruta): el título y el cuerpo llevan nombres (CAX-006).
                payload.routeExtras().forEach { (key, value) -> putExtra(key, value) }
            }
        return PendingIntent.getActivity(
            context,
            REQUEST_CODE,
            open,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private companion object {
        /** Siempre el mismo: lo que distingue un aviso de otro es la `data` del Intent (el tag completo), no este número. */
        const val REQUEST_CODE = 0
        const val NOTIFICATION_ID = 0
    }
}

/** Las únicas claves que lee la app al abrirse desde un aviso: la versión y la ruta. */
val PUSH_EXTRA_KEYS: List<String> = listOf(NativePushPayload.KEY_V, NativePushPayload.KEY_DEEP_LINK)

/**
 * Las claves del payload que pueden llegar como extras del intent (las de un aviso, o las de uno forjado por otra app,
 * porque la actividad es el lanzador). Tras atender el aviso se quitan TODAS, para que ni el título ni el cuerpo se
 * queden en el intent.
 */
val PUSH_EXTRA_KEYS_TO_CLEAR: List<String> =
    PUSH_EXTRA_KEYS +
        listOf(
            NativePushPayload.KEY_TYPE,
            NativePushPayload.KEY_TAG,
            NativePushPayload.KEY_TITLE,
            NativePushPayload.KEY_BODY,
            NativePushPayload.KEY_INSTALL,
        )

/**
 * La identidad de un aviso para Android: el tag ENTERO, no su `hashCode`. Va como `data` del `Intent` del
 * `PendingIntent` (que Android compara por acción, `data`, tipo y clase, no por extras): dos avisos distintos nunca
 * comparten `PendingIntent`, así que tocar uno nunca abre el destino de otro (CAX-005).
 */
fun notificationIdentity(tag: String): String =
    "tindivo-notification://order-update/" + URLEncoder.encode(tag, Charsets.UTF_8.name())
