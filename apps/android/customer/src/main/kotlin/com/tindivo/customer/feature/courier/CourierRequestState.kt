package com.tindivo.customer.feature.courier

import com.tindivo.core.network.generated.model.CreateCourierOrderRequest
import com.tindivo.core.network.generated.model.CreateCourierOrderRequestOrigin
import com.tindivo.core.network.generated.model.CreateOrderRequestCoordinates
import com.tindivo.customer.feature.addresses.isReferenceOk
import com.tindivo.customer.feature.checkout.AddressUi
import com.tindivo.customer.ui.fields.isValidPePhone
import com.tindivo.customer.ui.fields.localPePhone
import java.math.BigDecimal

/** Los límites del contrato (`packages/contracts/src/courier.ts` y `primitives.ts`). El servidor los vuelve a validar. */
internal const val COURIER_ITEM_MAX = 120
internal const val COURIER_NOTE_MAX = 140
internal const val COURIER_NAME_MAX = 120
internal const val COURIER_REFERENCE_MAX = 140

/** Lo que el sistema escribe cuando nadie puso un nombre (igual que la web): el contrato y la tabla lo exigen. */
internal const val ORIGIN_FALLBACK_NAME = "Quien entrega"
internal const val DESTINATION_FALLBACK_NAME = "Quien recibe"

/** Punto A (recojo) o B (entrega). */
internal enum class CourierEnd { Origin, Destination }

/** Quién le paga el transporte al motorizado. */
internal enum class CourierPayer { Origin, Destination }

/**
 * Un extremo del borrador: dónde (punto y referencia) y quién (celular obligatorio, nombre opcional). Celular y nombre
 * son PII: `toString` no los muestra, para que un log nunca los lleve.
 */
internal data class CourierPointDraft(
    val lat: BigDecimal? = null,
    val lng: BigDecimal? = null,
    val reference: String = "",
    val phone: String = "",
    val name: String = "",
) {
    val located: Boolean get() = lat != null && lng != null

    /** Largo y texto basura como el servidor y las direcciones (`isReferenceOk`, el vector compartido). */
    val referenceOk: Boolean get() = isReferenceOk(reference)
    val phoneOk: Boolean get() = isValidPePhone(phone)

    override fun toString(): String = "CourierPointDraft(located=$located)"
}

/** Lo primero que falta para poder pedir, en el orden en que la pantalla lo pide (el `missing` de la web). */
internal enum class CourierMissing {
    OriginPlace,
    DestinationPlace,
    OriginReference,
    DestinationReference,
    Item,
    OriginPhone,
    DestinationPhone,
    Prepaid,
    Allowed,
    RequesterPhone,
}

/** Lo que escribe la persona. Sin importes: la tarifa la pone el servidor al crear la entrega. */
internal data class CourierDraft(
    val origin: CourierPointDraft = CourierPointDraft(),
    val destination: CourierPointDraft = CourierPointDraft(),
    val item: String = "",
    val payer: CourierPayer = CourierPayer.Destination,
    val note: String = "",
    /** «Ya está listo y pagado» (`prepaidConfirmed`). */
    val prepaidConfirmed: Boolean = false,
    /** «Lo que envío está permitido» (`weightConfirmed`). */
    val weightConfirmed: Boolean = false,
) {
    fun point(end: CourierEnd) = if (end == CourierEnd.Origin) origin else destination

    fun withPoint(
        end: CourierEnd,
        point: CourierPointDraft,
    ) = if (end == CourierEnd.Origin) copy(origin = point) else copy(destination = point)

    override fun toString(): String = "CourierDraft(origin=$origin, destination=$destination)"
}

/** Lo que falta, o `null` si el borrador está completo y quien pide tiene el celular verificado. */
internal fun CourierDraft.firstMissing(phoneVerified: Boolean): CourierMissing? =
    when {
        !origin.located -> CourierMissing.OriginPlace
        !destination.located -> CourierMissing.DestinationPlace
        !origin.referenceOk -> CourierMissing.OriginReference
        !destination.referenceOk -> CourierMissing.DestinationReference
        item.isBlank() -> CourierMissing.Item
        !origin.phoneOk -> CourierMissing.OriginPhone
        !destination.phoneOk -> CourierMissing.DestinationPhone
        !prepaidConfirmed -> CourierMissing.Prepaid
        !weightConfirmed -> CourierMissing.Allowed
        !phoneVerified -> CourierMissing.RequesterPhone
        else -> null
    }

/**
 * El cuerpo de `POST /customer/courier-orders`, o `null` si falta algo. `isFragile` va en `false` y `readyInMin` en 0
 * como en la web: lo frágil se dice en las indicaciones y «listo ahora» lo fuerza el servidor (0235). El celular de
 * quien pide lo ignora el servidor (usa el verificado), pero el contrato lo exige.
 */
internal fun CourierDraft.toRequest(requester: CourierRequester): CreateCourierOrderRequest? {
    if (firstMissing(requester.phoneVerified) != null) return null
    val requesterPhone = requester.phone?.let(::localPePhone)?.takeIf(::isValidPePhone) ?: return null
    return CreateCourierOrderRequest(
        origin = origin.toEndpoint(ORIGIN_FALLBACK_NAME) ?: return null,
        destination = destination.toEndpoint(DESTINATION_FALLBACK_NAME) ?: return null,
        requesterName =
            requester.fullName
                .trim()
                .take(COURIER_NAME_MAX)
                .ifEmpty { "Cliente" },
        requesterPhone = requesterPhone,
        itemDescription = item.trim().take(COURIER_ITEM_MAX),
        isFragile = false,
        readyInMin = 0,
        payer =
            if (payer == CourierPayer.Origin) {
                CreateCourierOrderRequest.Payer.origin
            } else {
                CreateCourierOrderRequest.Payer.destination
            },
        weightConfirmed = weightConfirmed,
        prepaidConfirmed = prepaidConfirmed,
        driverNote = note.trim().take(COURIER_NOTE_MAX).ifEmpty { null },
    )
}

private fun CourierPointDraft.toEndpoint(fallbackName: String): CreateCourierOrderRequestOrigin? {
    val latitude = lat ?: return null
    val longitude = lng ?: return null
    return CreateCourierOrderRequestOrigin(
        contactName = name.trim().take(COURIER_NAME_MAX).ifEmpty { fallbackName },
        coordinates = CreateOrderRequestCoordinates(lat = latitude, lng = longitude),
        referenceText = reference.trim(),
        contactPhone = localPePhone(phone),
    )
}

/** Una dirección guardada como punto: su ubicación y su referencia. Sin ubicación no sirve (`null`). */
internal fun AddressUi.toPoint(keep: CourierPointDraft): CourierPointDraft? {
    val latitude = lat ?: return null
    val longitude = lng ?: return null
    return keep.copy(lat = latitude, lng = longitude, reference = reference.trim().take(COURIER_REFERENCE_MAX))
}

/** Un contacto frecuente: su sitio y, si los tiene, su celular y su nombre. */
internal fun CourierContactUi.toPoint(): CourierPointDraft =
    CourierPointDraft(
        lat = lat,
        lng = lng,
        reference = referenceText.trim().take(COURIER_REFERENCE_MAX),
        phone = phone?.let(::localPePhone).orEmpty(),
        name = name,
    )
