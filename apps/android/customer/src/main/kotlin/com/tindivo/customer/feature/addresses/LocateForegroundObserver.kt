package com.tindivo.customer.feature.addresses

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner

/**
 * Ata «Usar mi ubicación» a la vista del formulario: cuando la app deja de verse (ON_STOP: Inicio, pantalla bloqueada,
 * otra app encima) avisa con `false` para que la lectura en curso se cancele aunque el formulario siga compuesto; al
 * volver (ON_START) avisa con `true`, que no pide ninguna lectura por sí solo (CAX-001). Girar la pantalla
 * ([isChangingConfigurations]) no cuenta como salir, igual que al dejar de componer el formulario. Sin Compose, para
 * probarlo en la JVM.
 */
internal class LocateForegroundObserver(
    private val isChangingConfigurations: () -> Boolean,
    private val onForegroundChanged: (Boolean) -> Unit,
) : LifecycleEventObserver {
    override fun onStateChanged(
        source: LifecycleOwner,
        event: Lifecycle.Event,
    ) {
        when (event) {
            Lifecycle.Event.ON_START -> onForegroundChanged(true)
            Lifecycle.Event.ON_STOP -> if (!isChangingConfigurations()) onForegroundChanged(false)
            else -> Unit
        }
    }
}
