package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CheckoutRepository
import java.util.UUID

/**
 * [AttemptLookup] real: pregunta al servidor con `GET /customer/orders/attempts/{key}`. Nunca lanza.
 *
 * - `created` con pedido: [LookupResult.Created].
 * - `created` SIN pedido: [LookupResult.Unknown]. El pedido existe pero el servidor no pudo leer su código; no se
 *   puede mostrar y, como [LookupResult.Unknown] nunca reenvía, la persona acaba en «Mis pedidos» sin duplicarlo.
 * - `not_found`: [LookupResult.NotFound].
 * - `unknown`, un estado que esta versión no conoce (el contrato avisa de que puede llegar uno nuevo) y cualquier
 *   error (red, 401, 403, 422, 426, 5xx, cuerpo ilegible): [LookupResult.Unknown]. Lo seguro es no enviar nada.
 * - La consulta solo sale con el token de [accountId] ([CheckoutRepository.attempt]). Si la sesión cambió de cuenta,
 *   no sale y vuelve un error de red: [LookupResult.Unknown]. Un `not_found` de otra cuenta nunca llega aquí.
 */
class ApiAttemptLookup(
    private val repository: CheckoutRepository,
) : AttemptLookup {
    override suspend fun lookup(
        key: UUID,
        accountId: String,
    ): LookupResult {
        val result = repository.attempt(key, accountId)
        if (result !is ApiResult.Success) return LookupResult.Unknown
        val order = result.data.order
        return when {
            result.data.state == STATE_CREATED && order != null -> {
                LookupResult.Created(AttemptOrder(order.id.toString(), order.shortId))
            }

            result.data.state == STATE_NOT_FOUND -> {
                LookupResult.NotFound
            }

            else -> {
                LookupResult.Unknown
            }
        }
    }

    private companion object {
        const val STATE_CREATED = "created"
        const val STATE_NOT_FOUND = "not_found"
    }
}
