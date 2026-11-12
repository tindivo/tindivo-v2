package com.tindivo.customer.push

/**
 * Lo último que se mostró de cada seguimiento (`order-<sid>`, `courier-<sid>`): la versión del estado ([seq]) y si ya
 * terminó. Con él el seguimiento es MONÓTONO: un aviso que llega desordenado (más viejo que el que ya se mostró) se
 * ignora, y uno activo después de uno terminal no revive la barra fija de un pedido que ya se entregó o se canceló.
 *
 * La versión es el `seq` que manda `send-push` (el `updated_at` del pedido en milisegundos): no el paso, porque una
 * entrega soltada vuelve legítimamente del paso 2 al 1 y su `seq` sí crece.
 */
data class TrackingMark(
    val seq: Long?,
    val terminal: Boolean,
)

/** Dónde se guardan las marcas: sobreviven al proceso (un aviso tardío puede llegar con el proceso recién arrancado). */
interface TrackingMarkStore {
    fun load(): Map<String, TrackingMark>

    fun save(marks: Map<String, TrackingMark>)
}

/**
 * Decide si un aviso de seguimiento es más nuevo que lo ya mostrado y lo anota. Las operaciones no son atómicas entre
 * sí: quien las llama las corre bajo el candado de [TrackingPresenter].
 */
class TrackingLedger(
    private val store: TrackingMarkStore,
) {
    private var marks: MutableMap<String, TrackingMark>? = null

    /** Sube con cada aviso admitido y con cada limpieza: la puesta al día lo compara para saber que algo llegó en medio. */
    var version: Long = 0
        private set

    private fun loaded(): MutableMap<String, TrackingMark> = marks ?: store.load().toMutableMap().also { marks = it }

    /**
     * `true` si el aviso se debe mostrar (y queda anotado). Reglas, por [group]:
     * - tras un estado terminal solo se admite otro terminal, y solo si no es más viejo;
     * - con versión, uno más viejo que el último mostrado se descarta; igual o más nuevo se admite;
     * - sin versión (un servidor que no la manda) se admite: no hay con qué ordenarlo.
     */
    fun admit(
        group: String,
        seq: Long?,
        terminal: Boolean,
    ): Boolean {
        val all = loaded()
        val last = all[group]
        if (last != null) {
            if (last.terminal && !terminal) return false
            if (seq != null && last.seq != null && seq < last.seq) return false
        }
        val keptSeq = if (seq == null) last?.seq else maxOf(seq, last?.seq ?: seq)
        all[group] = TrackingMark(keptSeq, terminal || last?.terminal == true)
        trim(all)
        store.save(all)
        version++
        return true
    }

    /** Cerrar sesión o cambiar de cuenta: las marcas de la cuenta anterior no valen para la siguiente. */
    fun clear() {
        loaded().clear()
        store.save(emptyMap())
        version++
    }

    private fun trim(all: MutableMap<String, TrackingMark>) {
        if (all.size <= MAX_MARKS) return
        // Se van las más viejas (las sin versión primero): un seguimiento de hace días ya no se va a reordenar.
        val oldest = all.entries.sortedBy { it.value.seq ?: Long.MIN_VALUE }.take(all.size - MAX_MARKS)
        oldest.forEach { all.remove(it.key) }
    }

    private companion object {
        const val MAX_MARKS = 64
    }
}
