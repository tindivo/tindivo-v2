package com.tindivo.customer.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.tindivo.customer.MainActivity
import com.tindivo.customer.R

/**
 * El canal de los avisos del pedido (KT-10). Su id es el que manda `send-push` en `android.notification.channel_id`
 * (`FCM_CHANNEL_ID` en `supabase/functions/send-push/native.ts`): tienen que coincidir, o el sistema pintaría los avisos
 * en segundo plano en un canal genérico. Es estable: una vez creado, su importancia la controla el usuario.
 */
object PushChannels {
    const val ORDER_UPDATES = "order_updates"

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

    override fun notificationsEnabled(): Boolean = NotificationManagerCompat.from(context).areNotificationsEnabled()
}

/**
 * Pinta el aviso cuando la app está en primer plano. Usa [NativePushPayload.tag] como etiqueta (con el mismo id que
 * usa FCM, 0): un aviso nuevo del mismo pedido y evento reemplaza al anterior, venga del sistema o de aquí. Al tocarlo
 * abre la app con las mismas claves que `data`, igual que un aviso pintado por el sistema.
 */
class PushNotifier(
    private val context: Context,
) {
    fun show(payload: NativePushPayload) {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val open =
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                payload.toData().forEach { (key, value) -> putExtra(key, value) }
            }
        val content =
            PendingIntent.getActivity(
                context,
                payload.tag.hashCode(),
                open,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
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
                .setContentIntent(content)
                .build()
        try {
            manager.notify(payload.tag, NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
            // El permiso se revocó entre la comprobación y el aviso: no se muestra.
        }
    }

    private companion object {
        /** El id que usa FCM con la etiqueta: así el aviso de aquí y el del sistema se reemplazan entre sí. */
        const val NOTIFICATION_ID = 0
    }
}

/** Las claves del payload que lee la app al abrirse desde un aviso; el resto de extras no se mira. */
val PUSH_EXTRA_KEYS: List<String> =
    listOf(
        NativePushPayload.KEY_V,
        NativePushPayload.KEY_TYPE,
        NativePushPayload.KEY_TAG,
        NativePushPayload.KEY_TITLE,
        NativePushPayload.KEY_BODY,
        NativePushPayload.KEY_DEEP_LINK,
    )
