package com.tindivo.customer.feature.addresses

/** Qué contestó la persona al pedirle el permiso de ubicación (o que ya lo tenía). */
internal enum class LocationPermission { Granted, Denied, DeniedForever }

/** Por qué «Usar mi ubicación» no movió el pin. En todos los casos la persona sigue marcando a mano. */
internal enum class LocateNotice { Denied, DeniedForever, Off, NoFix, Unavailable }

/** El punto que dio el GPS. [seq] cambia con cada lectura: el mapa se mueve aunque el punto se repita. */
internal data class Located(
    val point: GeoPoint,
    val seq: Int,
)

internal data class LocateState(
    /** Hay Google Play services: sin él, el botón no se muestra. */
    val available: Boolean = false,
    val locating: Boolean = false,
    val notice: LocateNotice? = null,
    /** La última lectura que movió el pin, mientras la persona no lo haya movido a mano después. */
    val located: Located? = null,
)

/**
 * Aplica una lectura del GPS al formulario. Con un punto, ese es el elegido (y pasa por la misma validación de cobertura
 * que uno marcado a mano: [AddressFormState.missing]); la persona puede seguir ajustándolo. Sin punto, se dice por qué.
 * Con un guardado o un borrado en curso no se toca el punto: lo que se envía es lo que había.
 */
internal fun AddressFormState.withReading(reading: LocationReading): AddressFormState {
    val done = locate.copy(locating = false)
    return when (reading) {
        is LocationReading.Found -> {
            if (busy) {
                copy(locate = done)
            } else {
                val seq = (locate.located?.seq ?: 0) + 1
                copy(
                    point = reading.point,
                    saveError = null,
                    locate = done.copy(notice = null, located = Located(reading.point, seq)),
                )
            }
        }

        LocationReading.NoFix -> {
            copy(locate = done.copy(notice = LocateNotice.NoFix))
        }

        LocationReading.Off -> {
            copy(locate = done.copy(notice = LocateNotice.Off))
        }

        LocationReading.NoPermission -> {
            copy(locate = done.copy(notice = LocateNotice.Denied))
        }

        LocationReading.Unavailable -> {
            copy(locate = done.copy(notice = LocateNotice.Unavailable))
        }
    }
}
