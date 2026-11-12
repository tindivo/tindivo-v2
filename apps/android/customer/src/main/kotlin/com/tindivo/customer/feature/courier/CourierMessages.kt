package com.tindivo.customer.feature.courier

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.AppError

private const val HTTP_CONFLICT = 409
private const val HTTP_CLIENT_ERRORS_FROM = 400
private const val HTTP_CLIENT_ERRORS_TO = 499
private val HTTP_CLIENT_ERRORS = HTTP_CLIENT_ERRORS_FROM..HTTP_CLIENT_ERRORS_TO

/** El texto que mandó el servidor si es un rechazo con explicación; un corte o un 5xx, el genérico. */
internal fun AppError.toMessage(): CourierMessage {
    val known = this as? AppError.Known
    val detail = known?.detail?.takeIf { it.isNotBlank() }
    val stillProcessing = known?.code == ApiErrorCode.Conflict && known.status == HTTP_CONFLICT && detail == null
    return when {
        this is AppError.Network -> CourierMessage.Network
        stillProcessing -> CourierMessage.StillProcessing
        known != null && known.status in HTTP_CLIENT_ERRORS && detail != null -> CourierMessage.Server(detail)
        else -> CourierMessage.Generic
    }
}
