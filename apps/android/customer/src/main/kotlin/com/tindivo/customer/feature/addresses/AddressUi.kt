package com.tindivo.customer.feature.addresses

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.AppError
import com.tindivo.core.network.generated.model.ListCustomerAddresses200ResponseDataItemsInner
import java.util.UUID

/**
 * Una dirección guardada. [point] es el punto del mapa; [confirmed] dice si una persona lo eligió alguna vez
 * (`locationConfirmedAt`): un punto sin confirmar no es de fiar y el formulario no lo sella como si lo fuera.
 */
data class AddressUi(
    val id: UUID,
    val label: String,
    val line: String?,
    val reference: String,
    val point: GeoPoint?,
    val confirmed: Boolean,
    val isDefault: Boolean,
) {
    /** Sin punto confirmado en el mapa: la tarjeta lo avisa. */
    val missingLocation: Boolean get() = point == null || !confirmed
}

internal fun ListCustomerAddresses200ResponseDataItemsInner.toUi() =
    AddressUi(
        id = id,
        label = label,
        line = line,
        reference = reference,
        point = coordinates?.let { GeoPoint(it.lat.toDouble(), it.lng.toDouble()) },
        confirmed = locationConfirmedAt != null,
        isDefault = isDefault,
    )

private const val HTTP_UNAUTHORIZED = 401
private const val HTTP_NOT_FOUND = 404

/** Pasó por el refresco y el servidor sigue sin reconocer la sesión. */
internal fun AppError.isUnauthorized(): Boolean =
    this is AppError.Known && (code == ApiErrorCode.Unauthorized || status == HTTP_UNAUTHORIZED)

/** La dirección ya no existe (la borraron en otro teléfono). */
internal fun AppError.isNotFound(): Boolean =
    this is AppError.Known && (code == ApiErrorCode.NotFound || status == HTTP_NOT_FOUND)

/** El `detail` que el servidor explicó (por ejemplo, el motivo de un 422), si lo hay. */
internal fun AppError.serverDetail(): String? = (this as? AppError.Known)?.detail?.takeIf { it.isNotBlank() }

/** La dirección que se iba a editar ya no está en la libreta (el formulario la marca así al cargar). */
internal fun AppError.isMissingAtLoad(): Boolean = this is AppError.Unknown && code == "not_found"
