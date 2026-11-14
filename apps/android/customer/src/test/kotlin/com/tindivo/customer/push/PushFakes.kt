package com.tindivo.customer.push

import androidx.datastore.core.DataStore
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.PushDeviceInfo
import com.tindivo.customer.session.FakeSessionStore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.IOException
import java.util.UUID

/** «Cerrar sesión» sin avisos: para las pruebas de pantallas que no miran la baja. */
object NoPushSignOut : PushSignOut {
    override suspend fun beforeSignOut(accountId: String) = Unit
}

/** Un token de FCM a mano: [delete] lo cambia por otro, como hace Firebase. */
class FakePushTokens(
    override var enabled: Boolean = true,
) : PushTokens {
    var current: String? = token(1)
    var deletes = 0
    var reads = 0

    /** Si es `false`, [delete] falla (sin red) y el token no cambia. */
    var deleteWorks = true

    /** Si está, el siguiente [delete] se queda esperando (ya contado) hasta que la prueba la complete; solo ese. */
    var holdDelete: CompletableDeferred<Unit>? = null
    private var generation = 1

    override suspend fun token(): String? {
        reads++
        return current
    }

    override suspend fun delete(): Boolean {
        deletes++
        holdDelete?.let {
            holdDelete = null
            it.await()
        }
        if (!deleteWorks) return false
        generation++
        current = token(generation)
        return true
    }

    companion object {
        /** Un token con la forma de uno de FCM (más de 32 caracteres). */
        fun token(n: Int): String = "fcm-token-$n-".padEnd(TOKEN_LENGTH, 'x')

        private const val TOKEN_LENGTH = 48
    }
}

class FakeNotificationAccess(
    var granted: Boolean = true,
) : NotificationAccess {
    override fun permissionGranted(): Boolean = granted

    override fun notificationsEnabled(): Boolean = granted
}

/** Lo que salió hacia la API, con la cuenta a la que iba atado. */
data class PushCall(
    val method: String,
    val installId: UUID,
    val accountId: String,
    val token: String? = null,
)

/** La API de dispositivos: responde lo que la prueba encole (por defecto, éxito) y anota cada llamada. */
class FakePushDevices : PushDevices {
    val calls = mutableListOf<PushCall>()
    val registerResults = ArrayDeque<ApiResult<Unit>>()
    val unregisterResults = ArrayDeque<ApiResult<Unit>>()

    /** Si está, el siguiente `unregister` se queda esperando hasta que la prueba la complete. */
    var holdUnregister: CompletableDeferred<Unit>? = null

    /** Si está, el siguiente `register` se queda esperando (ya anotado) hasta que la prueba la complete. */
    var holdRegister: CompletableDeferred<Unit>? = null

    /** Corre al entrar cada `unregister`, antes de anotarlo: para mirar el estado en ese instante. */
    var onUnregister: suspend () -> Unit = {}

    override suspend fun register(
        installId: UUID,
        device: PushDeviceInfo,
        accountId: String,
    ): ApiResult<Unit> {
        calls += PushCall("PUT", installId, accountId, device.token)
        holdRegister?.await()
        return registerResults.removeFirstOrNull() ?: ApiResult.Success(Unit)
    }

    override suspend fun unregister(
        installId: UUID,
        accountId: String,
    ): ApiResult<Unit> {
        onUnregister()
        calls += PushCall("DELETE", installId, accountId)
        holdUnregister?.await()
        return unregisterResults.removeFirstOrNull() ?: ApiResult.Success(Unit)
    }

    companion object {
        val CONFLICT: ApiResult<Unit> =
            ApiResult.Failure(AppError.Known(ApiErrorCode.Conflict, status = 409, detail = null))
        val NO_NETWORK: ApiResult<Unit> = ApiResult.Failure(AppError.Network(IOException("sin red")))
    }
}

/** Los datos del aparato de las pruebas. */
val TestDevice = DeviceDescription { token -> PushDeviceInfo(token, appVersion = "0.1.0", notificationsEnabled = true) }

/** Un DataStore en memoria: cada `updateData` es atómico, como el real, sin tocar el disco. */
class MemoryDataStore<T>(
    initial: T,
) : DataStore<T> {
    private val state = MutableStateFlow(initial)
    private val mutex = Mutex()
    override val data: Flow<T> = state

    override suspend fun updateData(transform: suspend (t: T) -> T): T =
        mutex.withLock { transform(state.value).also { state.value = it } }
}

/** Las marcas del seguimiento en memoria. */
open class MemoryMarkStore : TrackingMarkStore {
    var saved: Map<String, TrackingMark> = emptyMap()

    override fun load(): Map<String, TrackingMark> = saved

    override fun save(marks: Map<String, TrackingMark>) {
        saved = marks.toMap()
    }
}

/** La bandeja del sistema en memoria: lo que la app tiene a la vista y lo que se le pidió. */
open class FakeTrackingNotifications : TrackingNotifications {
    val visible = linkedMapOf<TrackingKey, TrackingProgress?>()
    val shows = mutableListOf<Pair<NativePushPayload, TrackingOrigin>>()
    val removes = mutableListOf<TrackingKey>()
    var clears = 0

    override fun shown(): List<ShownTracking> = visible.map { (key, progress) -> ShownTracking(key, progress) }

    override fun show(
        payload: NativePushPayload,
        origin: TrackingOrigin,
    ) {
        shows += payload to origin
        TrackingKey.parse(payload.group)?.let { visible[it] = payload.progress }
    }

    override fun remove(key: TrackingKey) {
        removes += key
        visible.remove(key)
    }

    override fun clearAll() {
        clears++
        visible.clear()
    }
}

/** Todo lo que necesita la puerta de los avisos, atado a la misma sesión e instalación. */
class PresenterRig(
    val session: FakeSessionStore,
    val installations: PushInstallationStore =
        DataStorePushInstallationStore(MemoryDataStore(PushInstallationSnapshot())),
    val marks: MemoryMarkStore = MemoryMarkStore(),
    val notifications: FakeTrackingNotifications = FakeTrackingNotifications(),
) {
    val ledger = TrackingLedger(marks)
    val presenter = TrackingPresenter(session, installations, ledger, notifications)
}

/** La identidad de la instalación con una compuerta: [current] lee el valor y, si hay [gate], espera ahí (ya leído). */
class GatedInstallations(
    private val inner: PushInstallationStore,
) : PushInstallationStore by inner {
    var gate: CompletableDeferred<Unit>? = null
    val reading = CompletableDeferred<Unit>()

    override suspend fun current(): PushInstallation? {
        val value = inner.current()
        reading.complete(Unit)
        gate?.await()
        return value
    }
}

/** Un DataStore al que se le puede cortar la escritura (el disco lleno o dañado): [updateData] lanza [IOException]. */
class FlakyDataStore<T>(
    private val inner: DataStore<T>,
) : DataStore<T> {
    var failWrites = false
    override val data: Flow<T> = inner.data

    override suspend fun updateData(transform: suspend (t: T) -> T): T {
        if (failWrites) throw IOException("disco lleno")
        return inner.updateData(transform)
    }
}
