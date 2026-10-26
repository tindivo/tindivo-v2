package com.tindivo.customer.feature.orders

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.AppError

private const val HTTP_UNAUTHORIZED = 401
private const val HTTP_NOT_FOUND = 404

/** Pasó por el refresco y el servidor sigue sin reconocer la sesión. */
internal fun AppError.isUnauthorized(): Boolean =
    this is AppError.Known && (code == ApiErrorCode.Unauthorized || status == HTTP_UNAUTHORIZED)

/** El pedido no existe o no es de esta persona (la API responde 404 en ambos casos). */
internal fun AppError.isNotFound(): Boolean =
    this is AppError.Known && (code == ApiErrorCode.NotFound || status == HTTP_NOT_FOUND)

/**
 * Un fallo que no dice nada de los pedidos ya mostrados (sin conexión, o un error del contrato que el servidor
 * explicó): se conservan. Un [AppError.Unknown] puede ser un 200 que el cliente no supo leer, por ejemplo un importe
 * con otro tipo JSON, y se trata como un dato ilegible: lo mostrado se retira (falla cerrado).
 */
internal fun AppError.keepsShownOrders(): Boolean = this is AppError.Network || this is AppError.Known

/** Una respuesta con un importe o una fecha que no se puede leer: no se enseña a medias (falla cerrado). */
internal fun unreadableOrderError(): AppError = AppError.Unknown(code = null, detail = "invalid order data")
