package com.tindivo.customer.feature.checkout

import com.tindivo.customer.feature.catalog.business.OpenStatus
import com.tindivo.customer.feature.catalog.business.ScheduleDayUi
import com.tindivo.customer.feature.catalog.business.openStatus
import java.time.Instant

private const val HHMM_LENGTH = 5

/**
 * La hora (`HH:MM`) a la que cierra el local, solo si el horario de la carta dice que ahora atiende. Con el local
 * cerrado, sin horario o sin confirmar la apertura no hay hora que decir: el recojo no inventa ninguna.
 */
internal fun closingLabel(
    schedule: List<ScheduleDayUi>,
    now: Instant,
    openingConfirmed: Boolean?,
): String? = (openStatus(schedule, now, openingConfirmed) as? OpenStatus.Open)?.closesAt?.take(HHMM_LENGTH)
