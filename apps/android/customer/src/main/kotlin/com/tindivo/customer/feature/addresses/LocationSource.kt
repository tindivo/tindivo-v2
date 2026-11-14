package com.tindivo.customer.feature.addresses

/** Lo que devolvió una lectura del GPS al tocar «Usar mi ubicación». */
internal sealed interface LocationReading {
    data class Found(
        val point: GeoPoint,
    ) : LocationReading

    /** El GPS está encendido pero no dio una posición a tiempo. */
    data object NoFix : LocationReading

    /** La ubicación del teléfono está apagada. */
    data object Off : LocationReading

    /** La app no tiene permiso de ubicación (lo quitaron desde Ajustes entre el permiso y la lectura). */
    data object NoPermission : LocationReading

    /** Google Play services no está o no sirve en este teléfono. */
    data object Unavailable : LocationReading
}

/**
 * La única puerta a la ubicación del teléfono: una lectura, solo cuando la persona toca el botón. Nada de
 * actualizaciones continuas ni de ubicación en segundo plano. La real es [FusedLocationSource]; las pruebas usan un
 * falso.
 */
internal interface LocationSource {
    /** ¿Hay Google Play services para pedir la ubicación? Sin él, el botón no se muestra. */
    fun isAvailable(): Boolean

    /**
     * Una sola lectura de alta precisión. Si la corrutina se cancela (la persona salió del formulario), la lectura se
     * cancela también. Nunca lanza otra cosa que la cancelación.
     */
    suspend fun current(): LocationReading
}

/** Lo que el GPS tiene para dar una posición nueva: 15 s, como la web (`getCurrentPositionHA`). */
internal const val LOCATE_TIMEOUT_MS = 15_000L

/** El formulario deja de esperar un poco después: si el GPS no contesta ni con su propio plazo, se sigue a mano. */
internal const val LOCATE_GIVE_UP_MS = LOCATE_TIMEOUT_MS + 5_000L
