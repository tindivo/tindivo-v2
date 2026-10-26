package com.tindivo.customer.feature.cart

import androidx.datastore.core.DataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

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
}
