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
                is AddResult.Added -> outcome.cart.toSnapshot()
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
        store.updateData { current -> current?.toCartOrNull()?.setQuantity(signature, quantity)?.toSnapshot() }
    }

    suspend fun remove(signature: String) {
        store.updateData { current -> current?.toCartOrNull()?.removeLine(signature)?.toSnapshot() }
    }

    suspend fun clear() {
        store.updateData { null }
    }

    /**
     * Reserva la bolsa de huella [fingerprint] para [accountId] justo antes de enviar su pedido. Una bolsa con la que
     * una cuenta intentó enviar no pasa a otra: no hay «liberar», porque perderla cuesta volver a llenarla y un pedido
     * duplicado cuesta dinero. Editar la bolsa borra la reserva.
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

                reservation != null && reservation.accountId != accountId -> {
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

    /** Vacía la bolsa solo si la vigente es la de huella [fingerprint]: la que generó el pedido, no una editada después. */
    suspend fun consume(fingerprint: String) {
        store.updateData { current -> if (current?.toCartOrNull()?.fingerprint() == fingerprint) null else current }
    }

    /** Si la bolsa está reservada por una cuenta distinta de [accountId], la vacía y devuelve `true`. */
    suspend fun discardForeign(accountId: String): Boolean {
        var discarded = false
        store.updateData { current ->
            val reservation = current?.reservation
            if (reservation != null && reservation.accountId != accountId) {
                discarded = true
                null
            } else {
                current
            }
        }
        return discarded
    }
}
