package com.tindivo.customer.feature.store

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.generated.model.TrackStoreEventRequest
import com.tindivo.customer.di.ApplicationScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Quién manda un evento al servidor (`POST /public/store/events`). Una interfaz para probar sin red. */
internal fun interface StoreEventSender {
    suspend fun send(event: TrackStoreEventRequest): ApiResult<Unit>
}

/**
 * Cuántos eventos pueden esperar turno mientras otro está saliendo. Con el que está en vuelo, nunca hay más de
 * `STORE_EVENTS_PENDING_MAX + 1` eventos retenidos en memoria, por lenta o retenida que esté la red.
 */
internal const val STORE_EVENTS_PENDING_MAX = 16

/**
 * La medición del experimento, como la web (`trackStore`): anónima. [sessionId] es un UUID aleatorio que vive solo en
 * la memoria de este proceso: no se guarda en disco, no se liga a la cuenta y cambia al reabrir la app. No hay `ref`:
 * la app no recibe enlaces entrantes en esta versión.
 *
 * «Dispara y olvida»: los eventos salen de uno en uno, en orden, desde un único trabajador que vive en el alcance del
 * proceso ([scope]), así que un clic a WhatsApp se registra aunque la pantalla se cierre al abrirlo. [track] nunca
 * espera: deja el evento en una cola de [STORE_EVENTS_PENDING_MAX] y, si la cola está llena (la red va lenta o está
 * retenida), el evento se descarta ahí mismo, sin crear otra tarea ni guardarlo para después. El resultado también se
 * descarta: un fallo o un 429 no llega a la pantalla ni se reintenta (y [com.tindivo.core.network.RetryInterceptor] no
 * repite un `POST` sin `Idempotency-Key`). Medir es secundario: perder un evento es preferible a acumularlos.
 */
@Singleton
internal class StoreEvents
    @Inject
    constructor(
        private val sender: StoreEventSender,
        @ApplicationScope scope: CoroutineScope,
    ) {
        val sessionId: String = UUID.randomUUID().toString()

        private val pending = Channel<TrackStoreEventRequest>(capacity = STORE_EVENTS_PENDING_MAX)

        init {
            scope.launch {
                for (event in pending) sender.send(event)
            }
        }

        fun track(
            type: TrackStoreEventRequest.Type,
            productId: UUID? = null,
            searchTerm: String? = null,
        ) {
            val event =
                TrackStoreEventRequest(
                    type = type,
                    sessionId = sessionId,
                    productId = productId,
                    searchTerm = searchTerm?.trim()?.take(STORE_QUERY_MAX)?.takeIf { it.isNotEmpty() },
                )
            // Con la cola llena, trySend falla y el evento se pierde: ni espera ni reintento.
            pending.trySend(event)
        }
    }
