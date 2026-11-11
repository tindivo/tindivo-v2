package com.tindivo.customer.feature.courier

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tindivo.customer.R

/** El horario dicho como la web (`formatCourierHours`): «6 a 11 pm», o «10 am a 2 pm» si cambia de am a pm. */
@Composable
internal fun hoursText(service: CourierServiceUi): String? {
    val start = service.opensAt?.let(::hourLabelOf) ?: return null
    val end = service.closesAt?.let(::hourLabelOf) ?: return null
    return if (start.meridiem == end.meridiem) {
        stringResource(R.string.courier_hours_same, start.text, end.text, end.meridiem)
    } else {
        stringResource(R.string.courier_hours_cross, start.text, start.meridiem, end.text, end.meridiem)
    }
}

/** «Desde S/ 3.00 · Hasta 5 kg», con el horario si se sabe. El precio es el del servidor, tal cual. */
@Composable
internal fun factsText(service: CourierServiceUi): String {
    val hours = hoursText(service)
    return if (hours != null) {
        stringResource(R.string.courier_facts_hours, service.priceText, hours)
    } else {
        stringResource(R.string.courier_facts, service.priceText)
    }
}

/**
 * Por qué no se puede pedir ahora: el aviso del servidor si lo puso, «no disponible» si está apagado y, si solo está
 * fuera de horario, a qué hora abre. `null` si se puede pedir.
 */
@Composable
internal fun closedText(service: CourierServiceUi): String? {
    if (service.canRequest) return null
    service.pausedMessage?.let { return it }
    if (!service.enabled) return stringResource(R.string.courier_disabled)
    val opens = service.opensAt?.let(::hourLabelOf) ?: return stringResource(R.string.courier_closed_now)
    return stringResource(R.string.courier_opens_at, opens.text, opens.meridiem)
}

/** La etiqueta corta de una entrega en «Mis entregas». */
@StringRes
internal fun CourierPhase.labelRes(): Int =
    when (this) {
        is CourierPhase.Active -> {
            when (step) {
                CourierStep.Requested -> R.string.courier_label_requested
                CourierStep.Confirmed -> R.string.courier_label_confirmed
                CourierStep.OnTheWay, CourierStep.Delivered -> R.string.courier_label_on_the_way
            }
        }

        CourierPhase.Delivered -> {
            R.string.courier_label_delivered
        }

        is CourierPhase.Cancelled -> {
            R.string.courier_label_cancelled
        }

        CourierPhase.Unknown -> {
            R.string.courier_label_unknown
        }
    }

/** El título grande del seguimiento. */
@StringRes
internal fun CourierPhase.headlineRes(): Int =
    when (this) {
        is CourierPhase.Active -> {
            when (headline) {
                CourierHeadline.Searching -> R.string.courier_headline_searching
                CourierHeadline.GoingToPickup -> R.string.courier_headline_going
                CourierHeadline.PickingUp -> R.string.courier_headline_picking
                CourierHeadline.OnTheWay -> R.string.courier_headline_on_the_way
            }
        }

        CourierPhase.Delivered -> {
            R.string.courier_headline_delivered
        }

        is CourierPhase.Cancelled -> {
            R.string.courier_headline_cancelled
        }

        CourierPhase.Unknown -> {
            R.string.courier_label_unknown
        }
    }

/** El motivo de una cancelación (web `CANCEL_REASON_LABEL`); uno que la app no conoce es la genérica. */
@StringRes
internal fun cancelReasonRes(reason: String?): Int =
    when (reason) {
        NO_DRIVER -> R.string.courier_reason_no_driver
        "driver_rejected" -> R.string.courier_reason_driver_rejected
        "not_ready" -> R.string.courier_reason_not_ready
        "transport_unpaid" -> R.string.courier_reason_transport_unpaid
        "customer_cancelled" -> R.string.courier_reason_customer_cancelled
        "unreachable" -> R.string.courier_reason_unreachable
        else -> R.string.courier_reason_other
    }

/** Lo primero que falta para pedir, dicho sobre el botón. */
@StringRes
internal fun CourierMissing.textRes(): Int =
    when (this) {
        CourierMissing.OriginPlace -> R.string.courier_missing_origin_place
        CourierMissing.DestinationPlace -> R.string.courier_missing_destination_place
        CourierMissing.OriginReference -> R.string.courier_missing_origin_reference
        CourierMissing.DestinationReference -> R.string.courier_missing_destination_reference
        CourierMissing.Item -> R.string.courier_missing_item
        CourierMissing.OriginPhone -> R.string.courier_missing_origin_phone
        CourierMissing.DestinationPhone -> R.string.courier_missing_destination_phone
        CourierMissing.ReadyAndPaid -> R.string.courier_missing_ready
        CourierMissing.RequesterPhone -> R.string.courier_missing_requester_phone
    }

/** El texto de un envío que no creó nada: el del servidor si explicó, o uno de los nuestros. */
@Composable
internal fun sendMessageText(message: CourierMessage): String =
    when (message) {
        is CourierMessage.Server -> message.text
        CourierMessage.Network -> stringResource(R.string.courier_error_network)
        CourierMessage.Generic -> stringResource(R.string.courier_error_generic)
        CourierMessage.StillProcessing -> stringResource(R.string.courier_error_processing)
    }

/** El texto de una cancelación que no salió. */
@Composable
internal fun cancelMessageText(message: CourierMessage): String =
    when (message) {
        is CourierMessage.Server -> message.text
        CourierMessage.Network -> stringResource(R.string.courier_cancel_error_network)
        CourierMessage.Generic, CourierMessage.StillProcessing -> stringResource(R.string.courier_cancel_error_generic)
    }
