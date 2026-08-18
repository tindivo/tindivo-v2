import { signOutEverywhere } from '@tindivo/supabase'
import { dropLocalPushSubscription } from '@tindivo/ui'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * Cierra la sesión en TODOS los dispositivos del motorizado y borra TODAS sus
 * suscripciones push.
 *
 * Para cuando se pierde el teléfono. El botón normal de «cerrar sesión» NO pasa
 * por aquí: ese es local y vive en `/perfil` con el hook de push, que sabe
 * además limpiar el endpoint recordado y el debounce del auto-heal.
 *
 * Las dos mitades son necesarias y ninguna sobra:
 *
 *   - Revocar solo las sesiones deja al teléfono perdido sin poder abrir nada
 *     pero AÚN recibiendo notificaciones, y la vista previa lleva el nombre y
 *     la dirección del cliente. Se corta el acceso y la fuga sigue.
 *   - Borrar solo las suscripciones deja la sesión viva.
 *
 * Orden: primero el push (necesita JWT), después la revocación.
 */
export async function signOutEverywhereDevice(): Promise<void> {
  try {
    await api.request<void>('/push/subscriptions', { method: 'DELETE', body: { all: true } })
  } catch (err) {
    // No bloquea: si esto falla, revocar la sesión sigue siendo lo urgente.
    // Queda registrado porque el usuario creerá que apagó los avisos del
    // equipo perdido y hay que poder saber que no fue así.
    console.error('[auth] no se pudieron borrar las suscripciones push de todos los equipos', err)
  }
  await dropLocalPushSubscription()
  await signOutEverywhere(getSupabaseBrowser())
}
