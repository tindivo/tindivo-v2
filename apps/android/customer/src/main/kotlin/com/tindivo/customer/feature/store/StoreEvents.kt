package com.tindivo.customer.feature.store

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.generated.model.TrackStoreEventRequest
import com.tindivo.customer.di.ApplicationScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Quién manda un evento al servidor (`POST /public/store/events`). Una interfaz para probar sin red. */
internal fun interface StoreEventSender {
    suspend fun send(event: TrackStoreEventRequest): ApiResult<Unit>
}

/**
 * La medición del experimento, como la web (`trackStore`): anónima. [sessionId] es un UUID aleatorio que vive solo en
 * la memoria de este proceso: no se guarda en disco, no se liga a la cuenta y cambia al reabrir la app. No hay `ref`:
 * la app no recibe enlaces entrantes en esta versión.
 *
 * «Dispara y olvida»: cada evento sale en el alcance del proceso ([scope]), así que un clic a WhatsApp se registra
 * aunque la pantalla se cierre al abrirlo. El resultado se descarta: un fallo o un 429 no llega a la pantalla ni se
 * reintenta (y [com.tindivo.core.network.RetryInterceptor] no repite un `POST` sin `Idempotency-Key`).
 */
@Singleton
internal class StoreEvents
    @Inject
    constructor(
        private val sender: StoreEventSender,
        @ApplicationScope private val scope: CoroutineScope,
    ) {
        val sessionId: String = UUID.randomUUID().toString()

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
            scope.launch { sender.send(event) }
        }
    }
