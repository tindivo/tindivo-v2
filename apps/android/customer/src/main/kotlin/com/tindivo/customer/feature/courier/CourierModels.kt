package com.tindivo.customer.feature.courier

import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/**
 * El estado de Tindivo Entregas (`GET /public/courier/status`), ya leído. [priceText] es el precio base del servidor
 * listo para mostrar (`S/ 3.00`); la app no lo calcula. [opensAt] y [closesAt] son `HH:MM` en hora de Lima, tal cual.
 */
internal data class CourierServiceUi(
    val enabled: Boolean,
    val openNow: Boolean,
    val priceText: String,
    val opensAt: String?,
    val closesAt: String?,
    val pausedMessage: String?,
) {
    /** Se puede pedir ahora: el servicio está encendido y dentro de su horario. */
    val canRequest: Boolean get() = enabled && openNow
}

/** Los cuatro pasos del seguimiento de la web (`tracking-sheet.tsx`): «Recogido» y «En camino» son un solo toque. */
internal enum class CourierStep { Requested, Confirmed, OnTheWay, Delivered }

/** Lo que dice el título del seguimiento AHORA (el `TITLE` de la web). */
internal enum class CourierHeadline { Searching, GoingToPickup, PickingUp, OnTheWay }

/** En qué punto está una entrega, tal como la enseña la app. */
internal sealed interface CourierPhase {
    data class Active(
        val step: CourierStep,
        val headline: CourierHeadline,
    ) : CourierPhase

    data object Delivered : CourierPhase

    /** [reason] es el `cancelReason` tal cual; uno que la app no conoce se enseña como cancelación genérica. */
    data class Cancelled(
        val reason: String?,
    ) : CourierPhase

    /** Un estado que esta versión no conoce: sin pasos ni texto inventado. No es terminal: se sigue consultando. */
    data object Unknown : CourierPhase
}

/** La fase de [status] (`courier-status.ts`). `delivered` y `cancelled` son terminales (AGENTS.md 8). */
internal fun courierPhaseOf(
    status: String,
    cancelReason: String?,
): CourierPhase =
    when (status) {
        "requested" -> CourierPhase.Active(CourierStep.Requested, CourierHeadline.Searching)
        "accepted", "heading_to_pickup" -> CourierPhase.Active(CourierStep.Confirmed, CourierHeadline.GoingToPickup)
        "at_pickup" -> CourierPhase.Active(CourierStep.Confirmed, CourierHeadline.PickingUp)
        "picked_up", "heading_to_dropoff" -> CourierPhase.Active(CourierStep.OnTheWay, CourierHeadline.OnTheWay)
        "delivered" -> CourierPhase.Delivered
        "cancelled" -> CourierPhase.Cancelled(cancelReason)
        else -> CourierPhase.Unknown
    }

internal fun CourierPhase.isTerminal(): Boolean = this is CourierPhase.Delivered || this is CourierPhase.Cancelled

/** Solo una solicitud que nadie tomó se puede cancelar desde la app, como en la web. El servidor decide al final. */
internal fun CourierPhase.isCancellable(): Boolean = this is CourierPhase.Active && step == CourierStep.Requested

/** Sin motorizado no se cobró nada: decirlo evita la llamada de «¿me cobraron?» (web: «Sin cobro»). */
internal fun CourierPhase.wasFree(): Boolean = this is CourierPhase.Cancelled && reason == NO_DRIVER

internal const val NO_DRIVER = "no_driver"

/** Una entrega que sigue viva en un estado que la app conoce: la del banner «Entrega en curso». */
internal fun CourierPhase.isLive(): Boolean = this is CourierPhase.Active

/**
 * Una entrega en «Mis entregas». [feeText] es la tarifa del servidor ya formateada. [driverName] es el nombre del
 * motorizado asignado, si lo hay (sin teléfono). Los rótulos de los extremos son nombres de personas o referencias de
 * su casa: `toString` no los muestra, ni el nombre del motorizado ni lo que se lleva.
 */
internal data class CourierCardUi(
    val id: UUID,
    val shortId: String,
    val phase: CourierPhase,
    val originLabel: String,
    val destinationLabel: String,
    val itemDescription: String,
    val feeText: String,
    val createdAt: Instant,
    val driverName: String? = null,
) {
    override fun toString(): String = "CourierCardUi(shortId=$shortId, phase=$phase)"
}

/**
 * Un sitio y una persona que la cuenta ya usó en sus entregas (`frequentContacts`). Su celular es PII: se muestra en
 * la hoja y viaja en la entrega, pero nunca se escribe en un log.
 */
internal data class CourierContactUi(
    val name: String,
    val phone: String?,
    val referenceText: String,
    val lat: BigDecimal,
    val lng: BigDecimal,
) {
    override fun toString(): String = "CourierContactUi(***)"
}

/** Una página de «Mis entregas». */
internal data class CourierPageUi(
    val items: List<CourierCardUi>,
    val nextCursor: String?,
    val contacts: List<CourierContactUi>,
)

/**
 * El seguimiento de una entrega (`GET /public/courier/{shortId}`): sin teléfonos, pero con los nombres de quien entrega,
 * quien recibe y el motorizado. `toString` no los muestra.
 */
internal data class CourierTrackingUi(
    val shortId: String,
    val phase: CourierPhase,
    val originName: String,
    val destinationName: String,
    val itemDescription: String,
    val feeText: String,
    val payerIsOrigin: Boolean,
    val driverName: String?,
    val acceptMinutes: Int,
    val acceptDeadline: Instant?,
) {
    override fun toString(): String = "CourierTrackingUi(shortId=$shortId, phase=$phase)"
}

/** Lo que devuelve el alta: con qué ir al seguimiento. */
internal data class CreatedCourier(
    val id: UUID,
    val shortId: String,
)

/** Lo que el formulario necesita saber de quien pide. El celular es PII: `toString` no lo muestra. */
internal data class CourierRequester(
    val fullName: String,
    val phone: String?,
    val phoneVerified: Boolean,
) {
    override fun toString(): String = "CourierRequester(phoneVerified=$phoneVerified)"
}
