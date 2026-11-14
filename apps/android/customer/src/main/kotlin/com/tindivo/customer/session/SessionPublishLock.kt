package com.tindivo.customer.session

import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * La exclusión común entre «cambiar la cuenta visible» y «publicar algo de una cuenta» (CAX-001). Es un candado de JVM
 * (no de corrutinas): el servicio de FCM publica desde un hilo suyo y la sesión cambia desde otro, y un `Mutex` de
 * corrutinas no los excluye a los dos si cada uno toma el suyo.
 *
 * - [SupabaseSessionStore] cambia `state` y `signInGeneration` SIEMPRE dentro de este candado.
 * - [com.tindivo.customer.push.TrackingPresenter] corre «¿sigue siendo la cuenta?» → anotar marcas → pintar dentro de él.
 *
 * Así, o el aviso se pinta antes del cambio de sesión (y la limpieza que acompaña al cierre lo retira), o ve la sesión
 * nueva y no se pinta. El bloque no es `suspend`: dentro no puede haber una suspensión, y por tanto tampoco un cruce con
 * ningún otro candado de corrutinas.
 *
 * ORDEN DE CANDADOS (nadie los toma al revés): `PushRegistrar.mutex` → `TrackingPresenter.lock` → este;
 * `SupabaseSessionStore.mutex` → este. Este es siempre el último y nunca se toma otro mientras se tiene.
 */
class SessionPublishLock {
    private val monitor = ReentrantLock()

    fun <T> withLock(block: () -> T): T = monitor.withLock(block)
}
