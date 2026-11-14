package com.tindivo.customer.push

import java.security.MessageDigest

/**
 * Lo último que se sabe de cada seguimiento (`order-<sid>`, `courier-<sid>`): su [version], su [rank] (el orden del
 * estado: el paso, y por encima de todos el terminal) y si ya terminó.
 *
 * [version] es la versión del SERVIDOR más alta observada: el `seq` de cada aviso admitido (el `updated_at` de la fila en
 * milisegundos) y el `updatedAt` (la misma fila, la misma escala) de cada lectura REST de la puesta al día. Es monótona:
 * ni un aviso ni una lectura la bajan. Solo se admite un aviso cuyo `seq` la SUPERE: uno anterior o igual a lo ya
 * observado, venga de un aviso o de REST, no puede sustituir el estado actual. Así una entrega soltada (que baja de paso
 * pero con `seq` mayor) se admite y un aviso viejo, no. Nada depende del reloj del aparato.
 *
 * `null` = sin versión: marcas guardadas por una versión anterior de la app. Hasta que la puesta al día (al abrir la app)
 * lea el pedido no se admite ningún aviso activo de ese grupo: no hay con qué ordenarlo.
 */
data class TrackingMark(
    val version: Long?,
    val terminal: Boolean,
    val rank: Int = 0,
)

/**
 * Qué hacer con un aviso de seguimiento: [Admit] (se pinta y se anota), [Drop] (se ignora) o [Reconcile] (no se pinta:
 * no se puede ordenar con lo observado y hay que leer REST de ese seguimiento).
 */
enum class Admission { Admit, Drop, Reconcile }

/** Lo guardado: las marcas y la cuenta dueña de ellas ([owner], ver [trackingOwnerOf]; `null` si no consta). */
data class StoredMarks(
    val owner: String?,
    val marks: Map<String, TrackingMark>,
)

/** Dónde se guardan las marcas: sobreviven al proceso (un aviso tardío puede llegar con el proceso recién arrancado). */
interface TrackingMarkStore {
    fun load(): StoredMarks

    /** `true` solo si quedó escrito en disco: una escritura que falla no se da por guardada (CAX-003). */
    fun save(
        owner: String?,
        marks: Map<String, TrackingMark>,
    ): Boolean
}

/**
 * La cuenta dueña de las marcas, tal como se guarda: un resumen (SHA-256, 16 caracteres hexadecimales) del id de la
 * cuenta, no el id. Al cargarlas, si no es el de la cuenta actual, se descartan.
 */
fun trackingOwnerOf(accountId: String): String =
    MessageDigest
        .getInstance("SHA-256")
        .digest(accountId.toByteArray(Charsets.UTF_8))
        .take(OWNER_BYTES)
        .joinToString("") { "%02x".format(it) }

private const val OWNER_BYTES = 8

/**
 * Decide si un aviso de seguimiento es más nuevo que lo ya observado y lo anota. Las operaciones no son atómicas entre
 * sí: quien las llama las corre bajo el candado de [TrackingPresenter].
 *
 * PERSISTENCIA (CAX-003). Cada escritura vuelca el mapa COMPLETO. Si una escritura de [reconciled] o [clear] falla, se
 * reintenta una vez; si sigue fallando, la memoria queda correcta, el ledger queda [dirty] y la siguiente escritura que
 * salga bien lo vuelca todo y limpia la marca. El archivo guarda además la cuenta dueña ([bind]): si al cargarlo no es la
 * actual, se descarta, así que un [clear] que no llegó a disco no deja marcas de A a la vista de B. RESIDUAL: si el disco
 * rechaza TODA escritura y el proceso muere, el terminal reconciliado (o el borrado de [clear]) puede perderse y un aviso
 * activo tardío del mismo pedido volver a pintarse, hasta la siguiente puesta al día.
 */
class TrackingLedger(
    private val store: TrackingMarkStore,
) {
    private var marks: MutableMap<String, TrackingMark>? = null
    private var owner: String? = null

    /** La memoria tiene algo que el disco no: una escritura de [reconciled] o [clear] falló. Solo para pruebas. */
    var dirty: Boolean = false
        private set

    /** Sube con cada aviso admitido y con cada limpieza: la puesta al día lo compara para saber que algo llegó en medio. */
    var version: Long = 0
        private set

    private fun loaded(): MutableMap<String, TrackingMark> =
        marks ?: store.load().let { stored ->
            owner = stored.owner
            stored.marks.toMutableMap().also { marks = it }
        }

    /**
     * Las marcas son de [account] (ver [trackingOwnerOf]). Si el archivo era de OTRA cuenta se descartan (y el disco se
     * corrige con la siguiente escritura); si no constaba dueño (formato anterior), pasan a ser de esta.
     */
    fun bind(account: String) {
        val all = loaded()
        val current = owner
        if (current != null && current != account) {
            all.clear()
            dirty = true
        }
        owner = account
    }

    /** Un intento más si el primero falla; el mapa completo. */
    private fun persist(all: Map<String, TrackingMark>): Boolean {
        val written = store.save(owner, all) || store.save(owner, all)
        if (written) dirty = false
        return written
    }

    /**
     * Si el aviso se debe mostrar (y queda anotado). Reglas, por [group], con [seq] la versión del aviso:
     * - sin [seq] válido NO se admite: no hay con qué ordenarlo (un servidor que no lo manda, o una fecha ilegible);
     * - sin marca previa, se admite;
     * - tras un estado terminal solo se admite otro terminal;
     * - sin versión en la marca (formato anterior) no se admite: se pide la puesta al día ([Admission.Reconcile]) y
     *   hasta que lea el pedido no se admite ningún activo;
     * - solo se admite si [seq] SUPERA la versión de la marca: uno anterior no sustituye lo ya observado;
     * - con la MISMA versión y el mismo estado es un duplicado ([Admission.Drop]: no se pinta otra vez); con la misma
     *   versión y OTRO estado no se puede saber cuál es el posterior (la recepción no es el orden del estado): no se
     *   pinta ninguno y se pide la puesta al día ([Admission.Reconcile]), que lee el estado real;
     * - si la marca no se pudo escribir en disco NO se admite (CAX-003): no se pinta lo que no quedó anotado y la
     *   puesta al día lo resuelve al abrir la app.
     */
    fun admit(
        group: String,
        seq: Long?,
        terminal: Boolean,
        rank: Int,
    ): Admission {
        if (seq == null || seq <= 0) return Admission.Drop
        val last = loaded()[group]
        val decision = if (last == null) Admission.Admit else compare(last, seq, terminal, rank)
        if (decision != Admission.Admit) return decision
        // Sobre una copia: si el disco no la acepta, lo anotado en memoria no cambia.
        val next = loaded().toMutableMap()
        next[group] = TrackingMark(version = seq, terminal = terminal || last?.terminal == true, rank = rank)
        trim(next)
        if (!persist(next)) return Admission.Drop
        marks = next
        version++
        return Admission.Admit
    }

    private fun compare(
        last: TrackingMark,
        seq: Long,
        terminal: Boolean,
        rank: Int,
    ): Admission {
        val seen = last.version
        return when {
            last.terminal && !terminal -> Admission.Drop
            seen == null -> if (last.terminal) Admission.Drop else Admission.Reconcile
            seq > seen -> Admission.Admit
            seq < seen -> Admission.Drop
            last.terminal == terminal && last.rank == rank -> Admission.Drop
            else -> Admission.Reconcile
        }
    }

    /**
     * ¿Es la lectura REST con [serverVersion] más vieja que lo ya observado de [group]? Entonces no puede sustituir lo
     * que se muestra. Sin versión (REST no la trajo, o la marca es del formato anterior) no se puede decir: `false`.
     */
    fun isStale(
        group: String,
        serverVersion: Long?,
    ): Boolean {
        val seen = loaded()[group]?.version ?: return false
        return serverVersion != null && serverVersion < seen
    }

    /**
     * La puesta al día leyó [group] por REST. Si [terminal], el seguimiento terminó y ningún activo lo revive; si no,
     * [rank] (el paso) es el estado leído. En los dos casos la versión sube a [serverVersion] (el `updatedAt` leído, en
     * ms) si es mayor, AUNQUE el paso no haya cambiado: lo que REST observó ya no se puede sustituir por un aviso
     * anterior. `null` no cambia la versión.
     */
    fun reconciled(
        group: String,
        terminal: Boolean,
        rank: Int,
        serverVersion: Long? = null,
    ) {
        val all = loaded()
        val last = all[group]
        val seen =
            maxOf(
                last?.version ?: Long.MIN_VALUE,
                serverVersion ?: Long.MIN_VALUE,
            ).takeIf { it != Long.MIN_VALUE }
        all[group] =
            if (terminal) {
                TrackingMark(seen, terminal = true, rank = TERMINAL_RANK)
            } else {
                TrackingMark(seen, last?.terminal == true, rank)
            }
        trim(all)
        if (!persist(all)) dirty = true
        version++
    }

    /** Cerrar sesión o cambiar de cuenta: las marcas de la cuenta anterior no valen para la siguiente. */
    fun clear() {
        loaded().clear()
        owner = null
        if (!persist(emptyMap())) dirty = true
        version++
    }

    private fun trim(all: MutableMap<String, TrackingMark>) {
        if (all.size <= MAX_MARKS) return
        // Se van las más viejas (las sin versión primero): un seguimiento de hace días ya no se va a reordenar.
        val oldest = all.entries.sortedBy { it.value.version ?: Long.MIN_VALUE }.take(all.size - MAX_MARKS)
        oldest.forEach { all.remove(it.key) }
    }

    private companion object {
        const val MAX_MARKS = 64
    }
}

/** El rango de un estado terminal: por encima del de cualquier paso. */
const val TERMINAL_RANK: Int = Int.MAX_VALUE
