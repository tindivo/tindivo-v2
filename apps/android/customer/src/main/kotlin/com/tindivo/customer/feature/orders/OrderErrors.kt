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

/** Una respuesta con un importe o una fecha que no se puede leer: no se enseña a medias (falla cerrado). */
internal fun unreadableOrderError(): AppError = AppError.Unknown(code = null, detail = "invalid order data")
