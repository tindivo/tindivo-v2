import { signOutEverywhere, signOutLocal } from '@tindivo/supabase'
import { dropLocalPushSubscription, unsubscribeFromPush } from '@tindivo/ui'
import { useActiveOrdersStore } from './active-orders'
import { api } from './api'
import { getSupabaseBrowser } from './supabase/client'

/**
 * Salida de sesión del cliente: desengancha el dispositivo de los avisos y
 * cierra SU sesión, sin tocar las de los demás dispositivos de la persona.
 *
 * El orden no es negociable: `DELETE /push/subscriptions` va autenticado, así
 * que después del `signOutLocal` ya no hay JWT con el que borrar la fila y el
 * teléfono seguiría recibiendo el estado de pedidos ajenos.
 *
 * OJO: esto es para el botón «cerrar sesión» de /cuenta, donde HAY sesión. Las
 * limpiezas de sesión obsoleta (`host.tsx`, `use-checkout-auth.ts`) NO deben
 * pasar por aquí: ahí la sesión ya no vale, el DELETE se iría en un 401 y lo
 * único que hace falta es el `signOutLocal`.
 */
export async function signOutDevice(): Promise<void> {
  const baja = await unsubscribeFromPush((endpoint) =>
    api.request<void>('/push/subscriptions', { method: 'DELETE', body: { endpoint } }),
  )
  // Un fallo de la baja NO impide salir: cerrar sesión tiene que funcionar
  // aunque no haya red. La fila que quede se recicla sola.
  if (baja === 'failed') {
    console.error('[auth] no se pudo dar de baja el push al cerrar sesión')
  }
  await signOutLocal(getSupabaseBrowser())
  // El store de pedidos activos sobrevive al logout (es memoria del módulo, no
  // del árbol de React): sin esto el badge de la BottomNav seguiría mostrando
  // los pedidos del que salió a quien entre después en el mismo navegador.
  useActiveOrdersStore.getState().reset()
}

/**
 * Cierra la sesión en TODOS los dispositivos y borra TODAS las suscripciones
 * push de la persona. Para cuando se pierde el teléfono.
 *
 * Revocar solo las sesiones no basta: el equipo perdido dejaría de poder abrir
 * la app pero seguiría recibiendo notificaciones del estado de los pedidos, con
 * la dirección de entrega en la vista previa.
 */
export async function signOutEverywhereDevice(): Promise<void> {
  try {
    await api.request<void>('/push/subscriptions', { method: 'DELETE', body: { all: true } })
  } catch (err) {
    // No bloquea: revocar la sesión sigue siendo lo urgente. Se registra porque
    // la persona creerá que apagó los avisos del equipo perdido.
    console.error('[auth] no se pudieron borrar las suscripciones push de todos los equipos', err)
  }
  await dropLocalPushSubscription()
  await signOutEverywhere(getSupabaseBrowser())
  useActiveOrdersStore.getState().reset()
}
