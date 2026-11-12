package com.tindivo.customer.push

/**
 * Lo último que se mostró de cada seguimiento (`order-<sid>`, `courier-<sid>`): la versión del estado ([seq]), su
 * [rank] (el orden del estado: el paso del seguimiento, y por encima de todos el terminal) y si ya terminó. Con él el
 * seguimiento es MONÓTONO: un aviso que llega desordenado (más viejo que el que ya se mostró) se ignora, y uno activo
 * después de uno terminal no revive la barra fija de un pedido que ya se entregó o se canceló.
 *
 * La versión es el `seq` que manda `send-push` (el `updated_at` del pedido en milisegundos): no el paso, porque una
 * entrega soltada vuelve legítimamente del paso 2 al 1 y su `seq` sí crece. Dos estados distintos pueden caer en el
 * mismo milisegundo: con igual `seq` gana el de mayor [rank] (el orden de las transiciones: cada estado activo tiene un
 * paso mayor que el anterior y el terminal está por encima de todos).
 *
 * [floor] es el paso que la puesta al día (REST, que no trae versión) dejó en la bandeja: un aviso activo de menor paso
 * que llegue después se descarta, porque no se puede saber si es más nuevo que lo que leyó la consulta; el próximo
 * aviso de paso igual o mayor lo levanta, y si era uno legítimo que retrocedió, la siguiente puesta al día lo corrige.
 */
data class TrackingMark(
    val seq: Long?,
    val terminal: Boolean,
    val rank: Int = 0,
    val floor: Int = 0,
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
     * - sin versión válida ([seq] `null`) NO se admite: no hay con qué ordenarlo y podría ser más viejo que lo mostrado
     *   (un servidor que no la manda, o una fecha ilegible, deja el aviso sin pintar en vez de arriesgar un retroceso);
     * - tras un estado terminal solo se admite otro terminal, y solo si no es más viejo;
     * - uno de [seq] menor que el último mostrado se descarta; con el mismo [seq] se admite solo si su [rank] no es menor;
     * - un activo de paso menor que el que dejó la puesta al día ([TrackingMark.floor]) se descarta.
     */
    fun admit(
        group: String,
        seq: Long?,
        terminal: Boolean,
        rank: Int,
    ): Boolean {
        if (seq == null || seq <= 0) return false
        val all = loaded()
        val last = all[group]
        if (last != null && !follows(last, seq, terminal, rank)) return false
        all[group] =
            TrackingMark(
                seq = seq,
                terminal = terminal || last?.terminal == true,
                rank = rank,
                floor = 0,
            )
        trim(all)
        store.save(all)
        version++
        return true
    }

    private fun follows(
        last: TrackingMark,
        seq: Long,
        terminal: Boolean,
        rank: Int,
    ): Boolean {
        if (last.terminal && !terminal) return false
        if (!terminal && rank < last.floor) return false
        val lastSeq = last.seq ?: return true
        return seq > lastSeq || (seq == lastSeq && rank >= last.rank)
    }

    /**
     * La puesta al día dejó en la bandeja un estado leído por REST (sin versión): si [terminal], el seguimiento terminó
     * y ningún activo lo revive; si no, [rank] (el paso) queda como piso de lo que se puede mostrar después.
     */
    fun reconciled(
        group: String,
        terminal: Boolean,
        rank: Int,
    ) {
        val all = loaded()
        val last = all[group]
        all[group] =
            if (terminal) {
                TrackingMark(last?.seq, terminal = true, rank = TERMINAL_RANK, floor = 0)
            } else {
                TrackingMark(last?.seq, last?.terminal == true, last?.rank ?: rank, floor = rank)
            }
        trim(all)
        store.save(all)
        version++
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

/** El rango de un estado terminal: por encima del de cualquier paso. */
const val TERMINAL_RANK: Int = Int.MAX_VALUE
