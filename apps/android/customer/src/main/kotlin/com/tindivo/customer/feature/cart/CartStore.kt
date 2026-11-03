package com.tindivo.customer.feature.cart

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

    suspend fun remove(signature: String) {
        store.updateData { current ->
            current
                ?.toCartOrNull()
                ?.removeLine(signature)
                ?.toSnapshot()
                ?.keepingReservationOf(current)
        }
    }

    suspend fun clear() {
        store.updateData { null }
    }

    /**
     * Reserva la bolsa de huella [fingerprint] para [accountId] justo antes de enviar su pedido. Una bolsa con la que
     * una cuenta intentó enviar no pasa a otra: no hay «liberar», porque perderla cuesta volver a llenarla y un pedido
     * duplicado cuesta dinero. Editar la bolsa CONSERVA la reserva (deshacer una edición no libera la bolsa); solo
     * [replace] y [clear] la pierden. Una reserva solo vale si su huella es la de la bolsa vigente: con otra huella (una
     * versión nueva) se sobrescribe.
     */
    suspend fun reserve(
        accountId: String,
        fingerprint: String,
    ): ReserveResult {
        var result = ReserveResult.Changed
        store.updateData { current ->
            val reservation = current?.reservation
            when {
                current == null || current.toCartOrNull()?.fingerprint() != fingerprint -> {
                    result = ReserveResult.Changed
                    current
                }

                reservation != null && reservation.accountId != accountId && reservation.fingerprint == fingerprint -> {
                    result = ReserveResult.Foreign
                    current
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
     * bolsa), la vacía y devuelve `true`.
     */
    suspend fun discardForeign(accountId: String): Boolean {
        var discarded = false
        store.updateData { current ->
            val reservation = current?.reservation
            val foreign =
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
