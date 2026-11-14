package com.tindivo.customer.push

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.annotation.StringRes
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.tindivo.customer.MainActivity
import com.tindivo.customer.R
import java.net.URLEncoder

/**
 * El canal de los avisos del pedido (KT-10). Su id es el que manda `send-push` en `android.notification.channel_id`
 * (`FCM_CHANNEL_ID` en `supabase/functions/send-push/native.ts`) para los avisos que pinta el sistema; los de
 * seguimiento llegan solo-datos y los pinta [PushNotifier] en este mismo canal. Es estable: una vez creado, su
 * importancia la controla el usuario.
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
 * Pinta los avisos, con la app en primer o en segundo plano (los de seguimiento llegan solo-datos: el sistema no los
 * pinta). UNA notificación por [NativePushPayload.group]: la identidad es (etiqueta = group, id = 0), la misma que usaba
 * FCM al pintarlos él, así que un aviso nuevo del mismo pedido reemplaza al anterior, también al que pintó el sistema
 * antes de este cambio. Cómo se ve lo decide [lookFor]: fija con barra mientras el pedido está en curso, normal al
 * terminar. Al tocarla abre la app con las claves del payload, igual que un aviso pintado por el sistema.
 */
class PushNotifier(
    private val context: Context,
) : TrackingNotifications {
    override fun show(
        payload: NativePushPayload,
        origin: TrackingOrigin,
    ) {
        val manager = NotificationManagerCompat.from(context)
        if (!canPost(manager)) return
        val look = lookFor(payload, origin)
        val builder =
            NotificationCompat
                .Builder(context, PushChannels.ORDER_UPDATES)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(ContextCompat.getColor(context, R.color.push_accent))
                .setContentTitle(payload.title)
                .setContentText(payload.body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setOngoing(look.ongoing)
                .setAutoCancel(look.autoCancel)
                // Un aviso que llega suena siempre (cada cambio de estado, una vez). La puesta al día al abrir la app
                // solo toca notificaciones que ya están a la vista: con esto no vuelven a sonar.
                .setOnlyAlertOnce(look.silent)
                .setContentIntent(contentIntent(payload))
                .addExtras(progressExtras(look.progress))
        look.timeoutMs?.let(builder::setTimeoutAfter)
        applyProgress(builder, look.progress, payload.body)
        // Android 16+: pide que la promueva a «Live Update». Si el usuario o el sistema no lo permiten, se queda como
        // notificación fija normal.
        if (look.requestPromoted) builder.setRequestPromotedOngoing(true)
        try {
            manager.notify(notificationTag(payload), NOTIFICATION_ID, builder.build())
        } catch (_: SecurityException) {
            // El permiso se revocó entre la comprobación y el aviso: no se muestra.
        }
    }

    override fun shown(): List<ShownTracking> {
        val active =
            try {
                context.getSystemService(NotificationManager::class.java)?.activeNotifications ?: return emptyList()
            } catch (_: RuntimeException) {
                return emptyList()
            }
        return active.mapNotNull { sbn ->
            val notification = sbn.notification
            val ongoing = notification.flags and Notification.FLAG_ONGOING_EVENT != 0
            val key = sbn.tag?.let(TrackingKey::parse)
            if (sbn.id != NOTIFICATION_ID || !ongoing || key == null) return@mapNotNull null
            val extras = notification.extras
            ShownTracking(key, TrackingProgress.of(extras.getInt(EXTRA_STEP, 0), extras.getInt(EXTRA_STEPS, 0)))
        }
    }

    override fun remove(key: TrackingKey) {
        NotificationManagerCompat.from(context).cancel(key.group, NOTIFICATION_ID)
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
                // Solo lo necesario para navegar (versión y ruta): el título y el cuerpo llevan nombres.
                data = Uri.parse(notificationIdentity(notificationTag(payload)))
                payload.routeExtras().forEach { (key, value) -> putExtra(key, value) }
            }
        // La identidad del PendingIntent es el `data` del Intent, que contiene el grupo ENTERO (ver arriba): dos pedidos
        // nunca coinciden. Un `hashCode` de String sí colisiona (`order-AAAAAAAQ` y `order-AAAAAAB2`).
        return PendingIntent.getActivity(
            context,
            REQUEST_CODE,
            open,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    /**
     * La barra. En Android 16+ (API 36) con `ProgressStyle`, un segmento por paso (requisito para «Live Update»); antes,
     * `setProgress` clásico. Sin paso, el texto largo de siempre.
     */
    private fun applyProgress(
        builder: NotificationCompat.Builder,
        progress: TrackingProgress?,
        body: String,
    ) {
        when {
            progress != null && Build.VERSION.SDK_INT >= API_PROGRESS_STYLE -> {
                builder.setStyle(
                    NotificationCompat
                        .ProgressStyle()
                        .setProgressSegments(List(progress.steps) { NotificationCompat.ProgressStyle.Segment(1) })
                        .setProgress(progress.step),
                )
            }

            progress != null -> {
                builder.setProgress(progress.steps, progress.step, false)
                builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
            }

            else -> {
                builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
            }
        }
    }

    /** El paso queda guardado en la notificación: la puesta al día lo compara con el del servidor. */
    private fun progressExtras(progress: TrackingProgress?): Bundle =
        Bundle().apply {
            if (progress != null) {
                putInt(EXTRA_STEP, progress.step)
                putInt(EXTRA_STEPS, progress.steps)
            }
        }

    private companion object {
        /** Siempre el mismo: lo que distingue un aviso de otro es la `data` del Intent (`group` completo), no este número. */
        const val REQUEST_CODE = 0

        /** El id que usa FCM con la etiqueta: así el aviso de aquí y el del sistema se reemplazan entre sí. */
        const val NOTIFICATION_ID = 0

        /** Android 16 (`Build.VERSION_CODES.BAKLAVA`). */
        const val API_PROGRESS_STYLE = 36

        const val EXTRA_STEP = "com.tindivo.customer.push.STEP"
        const val EXTRA_STEPS = "com.tindivo.customer.push.STEPS"
    }
}

/** [TrackingTexts] con los textos de la app. */
class AndroidTrackingTexts(
    private val context: Context,
) : TrackingTexts {
    override fun title(status: TrackingStatus.Active): String = context.getString(titleRes(status))

    override fun body(status: TrackingStatus.Active): String = context.getString(R.string.push_tracking_body)

    @StringRes
    private fun titleRes(status: TrackingStatus.Active): Int {
        val step = status.progress.step
        return when (status.kind) {
            TrackingKind.Courier -> {
                when (step) {
                    1 -> R.string.push_tracking_courier_searching
                    2 -> R.string.push_tracking_courier_assigned
                    else -> R.string.push_tracking_courier_on_the_way
                }
            }

            TrackingKind.Pickup -> {
                when (step) {
                    1 -> R.string.push_tracking_order_received
                    2 -> R.string.push_tracking_order_preparing
                    else -> R.string.push_tracking_pickup_ready
                }
            }

            TrackingKind.Delivery -> {
                when (step) {
                    1 -> R.string.push_tracking_order_received
                    2 -> R.string.push_tracking_order_preparing
                    TrackingSteps.ORDER_READY -> R.string.push_tracking_order_ready
                    else -> R.string.push_tracking_order_on_the_way
                }
            }
        }
    }
}

/** Las únicas claves que lee la app al abrirse desde un aviso: la versión y la ruta. */
val PUSH_EXTRA_KEYS: List<String> = listOf(NativePushPayload.KEY_V, NativePushPayload.KEY_DEEP_LINK)

/**
 * Todas las claves de `data` que el sistema puede poner como extras en un aviso que pintó él (con el bloque
 * `notification`). Tras atender el aviso se quitan TODAS del intent, para que ni el título ni el cuerpo se queden en él.
 */
val PUSH_EXTRA_KEYS_TO_CLEAR: List<String> =
    PUSH_EXTRA_KEYS +
        listOf(
            NativePushPayload.KEY_TYPE,
            NativePushPayload.KEY_TAG,
            NativePushPayload.KEY_GROUP,
            NativePushPayload.KEY_TITLE,
            NativePushPayload.KEY_BODY,
            NativePushPayload.KEY_STEP,
            NativePushPayload.KEY_STEPS,
            NativePushPayload.KEY_TERMINAL,
            NativePushPayload.KEY_INSTALL,
            NativePushPayload.KEY_SEQ,
        )

/**
 * La identidad de un aviso para Android: el grupo ENTERO, no su `hashCode`. Va como `data` del `Intent` del
 * `PendingIntent` (que Android compara por acción, `data`, tipo y clase, no por extras): dos pedidos distintos nunca
 * comparten `PendingIntent`, así que tocar el aviso de uno nunca abre el otro. `order-AAAAAAAQ` y `order-AAAAAAB2`
 * tienen el mismo `hashCode` de String.
 */
fun notificationIdentity(group: String): String =
    "tindivo-notification://order-update/" + URLEncoder.encode(group, Charsets.UTF_8.name())
