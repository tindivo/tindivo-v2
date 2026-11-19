package com.tindivo.customer.bag

import androidx.datastore.core.DataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** Qué pasó al reservar la bolsa para el envío de una cuenta. */
enum class ReserveResult {
    /** La bolsa es la de la huella pedida y queda reservada para la cuenta (o ya lo estaba). */
    Reserved,

    /** No hay bolsa, o ya no es la de la huella pedida. */
    Changed,

    /** La bolsa está reservada por otra cuenta: no se toca. */
    Foreign,
}

/** Qué pasó al cambiar la cantidad de una línea ([CartStore.changeQuantity]). */
sealed interface QuantityResult {
    /** La línea ya no está (o no hay bolsa): no se tocó nada. */
    data object Missing : QuantityResult

    /** La cantidad cambió (o ya estaba en el tope). */
    data object Updated : QuantityResult

    /** Se quitó la línea [line], que estaba en [index] de la bolsa de [businessId]; quedan [remaining] líneas. */
    data class Removed(
        val businessId: String,
        val line: CartLine,
        val index: Int,
        val remaining: Int,
    ) : QuantityResult
}

/**
 * La bolsa del cliente, guardada en el teléfono (KT-9). Cada operación es un único `updateData`: leer, cambiar y
 * escribir no se intercalan con otra. Lo guardado que no cuadra con las reglas de la bolsa se trata como «sin bolsa»
 * (ver [toCartOrNull]) y la siguiente escritura lo reemplaza.
 */
class CartStore(
    private val store: DataStore<CartSnapshot?>,
) {
    /** La bolsa vigente, o `null` si no hay ninguna. */
    val cart: Flow<Cart?> = store.data.map { it?.toCartOrNull() }

    suspend fun add(
        businessId: String,
        businessName: String,
        line: CartLine,
    ): AddResult {
        var result: AddResult? = null
        store.updateData { current ->
            val outcome = addToCart(current?.toCartOrNull(), businessId, businessName, line)
            result = outcome
            when (outcome) {
                is AddResult.Added -> outcome.cart.toSnapshot()?.keepingReservationOf(current)
                is AddResult.OtherBusiness, AddResult.Full -> current
            }
        }
        return checkNotNull(result)
    }

    /** Empieza una bolsa nueva con [line]: solo después de que la persona aceptó vaciar la del otro negocio. */
    suspend fun replace(
        businessId: String,
        businessName: String,
        line: CartLine,
    ) {
        store.updateData { replacedWith(businessId, businessName, line).toSnapshot() }
    }

    suspend fun setQuantity(
        signature: String,
        quantity: Int,
    ) {
        store.updateData { current ->
            current
                ?.toCartOrNull()
                ?.setQuantity(signature, quantity)
                ?.toSnapshot()
                ?.keepingReservationOf(current)
        }
    }

    /**
     * Suma [delta] unidades a la línea de firma [signature], dentro de 1..[MAX_QUANTITY], en UNA escritura: dos toques
     * seguidos suman dos porque cada uno parte de lo guardado, no de lo que la pantalla alcanzó a mostrar. Con una
     * sola unidad y un [delta] negativo la línea se quita en esa misma escritura y se devuelve lo necesario para
     * «Deshacer» ([QuantityResult.Removed]).
     */
    suspend fun changeQuantity(
        signature: String,
        delta: Int,
    ): QuantityResult {
        var result: QuantityResult = QuantityResult.Missing
        store.updateData { current ->
            val cart = current?.toCartOrNull()
            val index = cart?.lines?.indexOfFirst { it.signature == signature } ?: -1
            if (cart == null || index < 0) {
                result = QuantityResult.Missing
                current
            } else {
                val line = cart.lines[index]
                val next =
                    if (line.quantity + delta < 1) {
                        result = QuantityResult.Removed(cart.businessId, line, index, remaining = cart.lines.size - 1)
                        cart.removeLine(signature)
                    } else {
                        result = QuantityResult.Updated
                        cart.setQuantity(signature, line.quantity + delta)
                    }
                next.toSnapshot()?.keepingReservationOf(current)
            }
        }
        return result
    }

    /** Recuerda cómo se entrega la bolsa. Sin bolsa no hace nada: el método es de una bolsa, no de la app. */
    suspend fun setDeliveryMethod(method: DeliveryMethod) {
        store.updateData { current ->
            current
                ?.toCartOrNull()
                ?.copy(deliveryMethod = method)
                ?.toSnapshot()
                ?.keepingReservationOf(current)
        }
    }

    suspend fun remove(signature: String) {
        store.updateData { current ->
            current
                ?.toCartOrNull()
                ?.removeLine(signature)
                ?.toSnapshot()
                ?.keepingReservationOf(current)
        }
    }

    /**
     * Devuelve [line] a la posición [index] de la bolsa de [businessId] (deshacer, CUS-CRT-013). No hace nada si la
     * bolsa ya es de otro negocio, está vacía o ya tiene ese plato; devuelve si la devolvió.
     */
    suspend fun restoreLine(
        businessId: String,
        line: CartLine,
        index: Int,
    ): Boolean {
        var restored = false
        store.updateData { current ->
            val cart = current?.toCartOrNull()
            if (cart == null || !cart.businessId.equals(businessId, ignoreCase = true)) {
                current
            } else {
                val next = cart.restoreLine(line, index)
                restored = next != cart
                next.toSnapshot()?.keepingReservationOf(current)
            }
        }
        return restored
    }

    /** Cambia la línea de firma [signature] por [line], editada (CUS-CRT-014); ver [replaceLine]. */
    suspend fun replaceLine(
        signature: String,
        line: CartLine,
    ) {
        store.updateData { current ->
            current
                ?.toCartOrNull()
                ?.replaceLine(signature, line)
                ?.toSnapshot()
                ?.keepingReservationOf(current)
        }
    }

    suspend fun clear() {
        store.updateData { null }
    }

    /**
     * Vacía la bolsa solo si [stillValid] se cumple DENTRO de la escritura (con el estado real, no con uno leído antes)
     * y, con [fingerprint], solo si la vigente es la bolsa de esa huella (no una cambiada después). Devuelve si la vació.
     */
    suspend fun clearIf(
        fingerprint: String? = null,
        stillValid: () -> Boolean,
    ): Boolean {
        var cleared = false
        store.updateData { current ->
            val same = fingerprint == null || current?.toCartOrNull()?.fingerprint() == fingerprint
            if (same && stillValid()) {
                cleared = true
                null
            } else {
                current
            }
        }
        return cleared
    }

    /**
     * Reserva la bolsa de huella [fingerprint] para [accountId] justo antes de enviar su pedido. Una bolsa con la que
     * una cuenta intentó enviar no pasa a otra: no hay «liberar», porque perderla cuesta volver a llenarla y un pedido
     * duplicado cuesta dinero. Editar la bolsa CONSERVA la reserva (deshacer una edición no libera la bolsa); solo
     * [replace] y [clear] la pierden. Una reserva solo vale si su huella es la de la bolsa vigente: con otra huella (una
     * versión nueva) se sobrescribe.
     *
     * Todo ocurre en UNA escritura. [stillValid] se evalúa DENTRO de ella, con el estado real de la bolsa, para que la
     * continuación atrasada de una cuenta que ya no es la vigente no decida ni borre nada: sin vigencia, o sin bolsa
     * o con otra huella, da [ReserveResult.Changed] y no toca nada. Con una reserva ajena de esta huella da
     * [ReserveResult.Foreign] y la misma escritura VACÍA la bolsa: el descarte es esta escritura, no un paso posterior
     * que pudiera caer sobre una bolsa nueva.
     */
    suspend fun reserve(
        accountId: String,
        fingerprint: String,
        stillValid: () -> Boolean,
    ): ReserveResult {
        var result = ReserveResult.Changed
        store.updateData { current ->
            val reservation = current?.reservation
            when {
                !stillValid() || current == null || current.toCartOrNull()?.fingerprint() != fingerprint -> {
                    result = ReserveResult.Changed
                    current
                }

                reservation != null && reservation.accountId != accountId && reservation.fingerprint == fingerprint -> {
                    result = ReserveResult.Foreign
                    null
                }

                else -> {
                    result = ReserveResult.Reserved
                    current.copy(reservation = CartReservation(accountId, fingerprint))
                }
            }
        }
        return result
    }

    /**
     * Vacía la bolsa solo si la vigente es la de huella [fingerprint] Y está reservada por [accountId]: la que generó
     * el pedido de esa cuenta, no una editada después ni una idéntica que armó otra cuenta.
     */
    suspend fun consume(
        accountId: String,
        fingerprint: String,
    ) {
        store.updateData { current ->
            val own = current?.reservation?.accountId == accountId
            if (own && current?.toCartOrNull()?.fingerprint() == fingerprint) null else current
        }
    }

    /**
     * Si la bolsa vigente está reservada por una cuenta distinta de [accountId] (y la reserva es de esta versión de la
     * bolsa), la vacía y devuelve `true`. [stillValid] se evalúa dentro de la escritura: sin vigencia no toca nada y
     * devuelve `false`.
     */
    suspend fun discardForeign(
        accountId: String,
        stillValid: () -> Boolean,
    ): Boolean {
        var discarded = false
        store.updateData { current ->
            val reservation = current?.reservation
            val foreign =
                stillValid() &&
                    reservation != null &&
                    reservation.accountId != accountId &&
                    reservation.fingerprint == current?.toCartOrNull()?.fingerprint()
            if (foreign) {
                discarded = true
                null
            } else {
                current
            }
        }
        return discarded
    }
}

private fun CartSnapshot.keepingReservationOf(previous: CartSnapshot?): CartSnapshot =
    copy(reservation = previous?.reservation)
