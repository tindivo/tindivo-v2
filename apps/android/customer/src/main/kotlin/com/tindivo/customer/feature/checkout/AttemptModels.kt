package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.AppError
import java.util.UUID

/** En qué punto quedó el último envío de un intento. Ninguno de los dos prueba que el pedido NO exista. */
enum class AttemptPhase {
    /** Se marcó antes de enviar. Si el proceso muere aquí, al reabrir cuenta como incierto. */
    InFlight,

    /** Llegó una respuesta, o un error, que no confirma la creación. */
    Uncertain,
}

/**
 * El intento de pedido de una cuenta: su clave, la huella de la bolsa del último envío y cómo quedó.
 *
 * @param sentAtEpochMs cuándo salió el último envío; `null` solo en un registro que nunca se envió.
 * @param lastResponseDefinitive la última respuesta fue un 2xx o un 4xx: no queda ninguna petición en vuelo.
 */
data class Attempt(
    val key: String,
    val cartFingerprint: String,
    val phase: AttemptPhase,
    val sentAtEpochMs: Long?,
    val lastResponseDefinitive: Boolean,
)

/**
 * Todo lo que hay en disco: un intento por cuenta. Ninguna operación de una cuenta toca la entrada de otra y cerrar
 * sesión no borra nada.
 *
 * @param lost el archivo estaba corrupto, de una versión desconocida o con una clave ilegible: no se sabe qué pedidos
 *   quedaron inciertos. Mientras una cuenta no esté en [acknowledged], [OrderAttemptLedger.place] no envía nada.
 * @param acknowledged las cuentas cuya persona ya revisó «Mis pedidos» tras una pérdida.
 */
data class Ledger(
    val lost: Boolean = false,
    val acknowledged: Set<String> = emptySet(),
    val attempts: Map<String, Attempt> = emptyMap(),
)

/** Dónde vive el registro. En la app es DataStore (KT-9); en las pruebas, memoria. */
interface LedgerStore {
    suspend fun read(): Ledger

    suspend fun write(ledger: Ledger)
}

/** El pedido que el servidor ya tiene para una clave. */
data class AttemptOrder(
    val id: String,
    val shortId: String,
)

/** Respuesta de `GET /customer/orders/attempts/{key}`. */
sealed interface LookupResult {
    /** Hay una fila vigente: el pedido con esa clave existe (se escribe en la misma transacción que el pedido). */
    data class Created(
        val order: AttemptOrder,
    ) : LookupResult

    /** No hay fila: ningún envío con esa clave creó el pedido (o ya venció la retención). */
    data object NotFound : LookupResult

    /** El servidor no sabe, la red falló o la consulta no se pudo leer. Lo seguro es no enviar nada. */
    data object Unknown : LookupResult
}

/** Consulta si una clave ya creó su pedido. */
interface AttemptLookup {
    suspend fun lookup(key: UUID): LookupResult
}

/**
 * PENDIENTE: el endpoint `GET /customer/orders/attempts/{key}` llega en otro PR. Mientras tanto responde
 * [LookupResult.Unknown], que es lo seguro: [OrderAttemptLedger] no reenvía ningún intento incierto.
 */
object NotImplementedAttemptLookup : AttemptLookup {
    override suspend fun lookup(key: UUID): LookupResult = LookupResult.Unknown
}

/** Lo que pasó al intentar crear el pedido. */
sealed interface PlaceResult<out T> {
    /** 201 de la clave de este intento. */
    data class Created<T>(
        val data: T,
    ) : PlaceResult<T>

    /** Un intento anterior ya había creado el pedido: no se envió nada. */
    data class AlreadyCreated(
        val order: AttemptOrder,
    ) : PlaceResult<Nothing>

    /** El servidor contestó con un error. La clave se conserva. */
    data class Failed(
        val error: AppError,
    ) : PlaceResult<Nothing>

    /** Un envío anterior pudo seguir en vuelo: se espera a que pase la ventana. No se envió nada. */
    data object StillProcessing : PlaceResult<Nothing>

    /**
     * No consta si el pedido existe. No se envió nada y se conserva todo: la UI enseña «Mis pedidos» y, si la persona
     * confirma, llama a [OrderAttemptLedger.acknowledgeReconciled].
     */
    data object NeedsReconciliation : PlaceResult<Nothing>
}
