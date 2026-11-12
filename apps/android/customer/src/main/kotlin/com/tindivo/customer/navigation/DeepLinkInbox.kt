package com.tindivo.customer.navigation

import com.tindivo.customer.push.NativePushPayload
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * El destino que pidió abrir un aviso tocado y que la navegación aún no atendió. Vive lo que el proceso; la actividad lo
 * deja aquí y [DeepLinkViewModel] lo recoge. Uno nuevo reemplaza al anterior: vale el último aviso tocado.
 */
class DeepLinkInbox {
    private val mutablePending = MutableStateFlow<DeepLinkTarget?>(null)
    val pending: StateFlow<DeepLinkTarget?> = mutablePending.asStateFlow()

    fun offer(target: DeepLinkTarget) {
        mutablePending.value = target
    }

    /** Atendido: se quita solo si sigue siendo [target] (uno más nuevo no se pierde). */
    fun consume(target: DeepLinkTarget) {
        mutablePending.compareAndSet(target, null)
    }
}

/**
 * El destino de un aviso tocado, desde los extras con que se abrió la app (las claves de `data`, tanto si el aviso lo
 * pintó el sistema como la app). Un payload que no es v1 válido no abre nada (`null`); uno válido con una ruta que la
 * app no conoce, el inicio.
 */
fun pushTargetFrom(extras: Map<String, String>): DeepLinkTarget? =
    NativePushPayload.decode(extras)?.let { DeepLinkRouter.route(it.deepLink) }
