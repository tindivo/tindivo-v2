package com.tindivo.customer.push

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStore
import androidx.datastore.core.Serializer
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.InputStream
import java.io.OutputStream

internal const val NOTIFICATION_PREFS_VERSION = 1

/**
 * Lo que la persona decidió sobre los avisos EN ESTE APARATO (no viaja con la cuenta):
 * - [offered]: la hoja «¿Activar notificaciones?» ya se ofreció (o su momento pasó con los avisos ya encendidos). Se
 *   ofrece una sola vez (CUS-NOT-001).
 * - [enabled]: el interruptor «Avisos de tus pedidos» de Cuenta. Apagado, el aparato se da de baja y no se pinta nada.
 * - [systemAsked]: el diálogo del sistema (Android 13+) ya se mostró; después, solo queda Ajustes.
 */
@Serializable
data class NotificationPrefs(
    val offered: Boolean = false,
    val enabled: Boolean = true,
    val systemAsked: Boolean = false,
)

@Serializable
data class NotificationPrefsSnapshot(
    val version: Int = NOTIFICATION_PREFS_VERSION,
    val prefs: NotificationPrefs = NotificationPrefs(),
)

interface NotificationPrefsStore {
    val prefs: Flow<NotificationPrefs>

    suspend fun current(): NotificationPrefs = prefs.first()

    suspend fun update(transform: (NotificationPrefs) -> NotificationPrefs)

    /** Sin preferencias guardadas: los avisos siempre encendidos (solo para piezas que no las necesitan). */
    object AlwaysOn : NotificationPrefsStore {
        override val prefs: Flow<NotificationPrefs> = kotlinx.coroutines.flow.flowOf(NotificationPrefs())

        override suspend fun update(transform: (NotificationPrefs) -> NotificationPrefs) = Unit
    }
}

class DataStoreNotificationPrefsStore(
    private val store: DataStore<NotificationPrefsSnapshot>,
) : NotificationPrefsStore {
    override val prefs: Flow<NotificationPrefs> = store.data.map { it.prefs }

    override suspend fun update(transform: (NotificationPrefs) -> NotificationPrefs) {
        store.updateData { it.copy(prefs = transform(it.prefs)) }
    }
}

/** Un archivo ilegible o de otra versión es corrupción: el módulo lo reemplaza por las preferencias de fábrica. */
object NotificationPrefsSerializer : Serializer<NotificationPrefsSnapshot> {
    private val json =
        Json {
            ignoreUnknownKeys = false
            encodeDefaults = true
        }

    override val defaultValue: NotificationPrefsSnapshot = NotificationPrefsSnapshot()

    override suspend fun readFrom(input: InputStream): NotificationPrefsSnapshot {
        val snapshot =
            try {
                json.decodeFromString(NotificationPrefsSnapshot.serializer(), input.readBytes().decodeToString())
            } catch (e: IllegalArgumentException) {
                throw CorruptionException("Las preferencias de avisos no se pudieron leer", e)
            }
        if (snapshot.version != NOTIFICATION_PREFS_VERSION) {
            throw CorruptionException("Versión ${snapshot.version} desconocida")
        }
        return snapshot
    }

    override suspend fun writeTo(
        t: NotificationPrefsSnapshot,
        output: OutputStream,
    ) {
        output.write(json.encodeToString(NotificationPrefsSnapshot.serializer(), t).encodeToByteArray())
    }
}

/**
 * ¿Es el momento de ofrecer la hoja? Con el pedido ya confirmado por el negocio y aún en curso: no mientras se valida, se
 * espera que el negocio acepte o falta el pago, ni con el pedido terminado (supuesto S1, pregunta a Jesús).
 */
fun pushOfferMoment(status: String): Boolean = status in OFFER_STATUSES

private val OFFER_STATUSES =
    setOf(
        "confirmed",
        "preparing",
        "waiting_driver",
        "heading_to_restaurant",
        "waiting_at_restaurant",
        "picked_up",
        "ready_for_pickup",
    )
