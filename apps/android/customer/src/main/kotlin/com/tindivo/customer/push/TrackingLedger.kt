package com.tindivo.customer.push

/**
 * Lo último que se mostró de cada seguimiento (`order-<sid>`, `courier-<sid>`): la versión del estado ([seq]), su
 * [rank] (el orden del estado: el paso del seguimiento, y por encima de todos el terminal) y si ya terminó. Con él el
 * seguimiento es MONÓTONO: un aviso que llega desordenado (más viejo que el que ya se mostró) se ignora, y uno activo
 * después de uno terminal no revive la barra fija de un pedido que ya se entregó o se canceló.
 *
 * La versión es el `seq` que manda `send-push` (el `updated_at` del pedido en milisegundos): no el paso, porque una
 * entrega soltada vuelve legítimamente del paso 2 al 1 y su `seq` sí crece. Con igual `seq` (dos estados en el mismo
 * milisegundo) NO hay forma de saber cuál es el posterior (ni el paso ni nada del aviso lo dice, y una entrega soltada
 * también baja de paso): se admite el que llega después, salvo que el último sea terminal.
 *
 * [floor] es el paso que la puesta al día (REST) dejó en la bandeja, y [floorUntil] la versión de ese estado: el
 * `updatedAt` que trae REST, en milisegundos, de la MISMA fila y el mismo reloj (el del servidor) que el `seq` de un
 * aviso. Un aviso activo de menor paso se descarta solo si su `seq` NO supera [floorUntil]: es anterior o igual a lo que
 * leyó la consulta. Uno con `seq` mayor es posterior (un retroceso legítimo, como una entrega soltada) y se admite.
 * Nada depende del reloj del aparato. Sin `updatedAt` legible el piso vale hasta que llegue un aviso de paso igual o
 * mayor (lo prudente).
 */
data class TrackingMark(
    val seq: Long?,
    val terminal: Boolean,
    val rank: Int = 0,
    val floor: Int = 0,
    /** Hasta qué versión (`seq`, en ms) vale el [floor] (el `updatedAt` de REST); con `0` no hay piso que valga. */
    val floorUntil: Long = 0,
)

/** Dónde se guardan las marcas: sobreviven al proceso (un aviso tardío puede llegar con el proceso recién arrancado). */
interface TrackingMarkStore {
    fun load(): Map<String, TrackingMark>

    /** `true` solo si quedó escrito en disco: una escritura que falla no se da por guardada (CAX-003). */
    fun save(marks: Map<String, TrackingMark>): Boolean
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
     * - uno de [seq] menor que el último mostrado se descarta; con el mismo [seq] se admite el que llega después;
     * - un activo de paso menor que el que dejó la puesta al día ([TrackingMark.floor]) se descarta mientras su [seq]
     *   no supere [TrackingMark.floorUntil] (la versión que leyó REST);
     * - si la marca no se pudo escribir en disco NO se admite (CAX-003): no se pinta lo que no quedó anotado y la
     *   puesta al día lo resuelve al abrir la app.
     */
    fun admit(
        group: String,
        seq: Long?,
        terminal: Boolean,
        rank: Int,
    ): Boolean {
        if (seq == null || seq <= 0) return false
        val last = loaded()[group]
        if (last != null && !follows(last, seq, terminal, rank)) return false
        // Sobre una copia: si el disco no la acepta, lo anotado en memoria no cambia.
        val next = loaded().toMutableMap()
        next[group] =
            TrackingMark(
                seq = seq,
                terminal = terminal || last?.terminal == true,
                rank = rank,
                floor = 0,
            )
        trim(next)
        if (!store.save(next)) return false
        marks = next
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
        if (!terminal && rank < last.floor && seq <= last.floorUntil) return false
        val lastSeq = last.seq ?: return true
        return seq >= lastSeq
    }

    /**
     * La puesta al día dejó en la bandeja un estado leído por REST: si [terminal], el seguimiento terminó y ningún
     * activo lo revive; si no, [rank] (el paso) queda como piso de lo que se puede mostrar después, mientras el aviso no
     * sea posterior a [serverVersion] (el `updatedAt` leído, en ms; `null` si no se pudo leer: el piso no caduca).
     */
    fun reconciled(
        group: String,
        terminal: Boolean,
        rank: Int,
        serverVersion: Long? = null,
    ) {
        val all = loaded()
        val last = all[group]
        all[group] =
            if (terminal) {
                TrackingMark(last?.seq, terminal = true, rank = TERMINAL_RANK, floor = 0)
            } else {
                TrackingMark(
                    last?.seq,
                    last?.terminal == true,
                    last?.rank ?: rank,
                    floor = rank,
                    floorUntil = serverVersion ?: Long.MAX_VALUE,
                )
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
