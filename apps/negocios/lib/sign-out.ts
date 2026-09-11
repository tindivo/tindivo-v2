import { signOutLocal } from '@tindivo/supabase'
import { unsubscribeFromPush } from '@tindivo/ui'
import { olvidarApagado } from '@/hooks/use-push-status'
import { api } from './api'
import { getSupabaseBrowser } from './supabase/client'

/**
 * Única salida de sesión del panel: desengancha el dispositivo de los avisos y
 * cierra SU sesión, sin tocar las de los demás dispositivos del negocio.
 *
 * El orden no es negociable: `DELETE /push/subscriptions` va autenticado, así
 * que después del `signOutLocal` ya no hay JWT con el que borrar la fila y el
 * navegador se quedaría sonando con pedidos de una cuenta de la que la cajera
 * acaba de salir.
 *
 * Existe como módulo propio porque el panel cierra sesión desde dos sitios
 * (el chrome y el editor de ítems) y los dos tienen que hacer exactamente esto.
 */
export async function signOutDevice(): Promise<void> {
  const baja = await unsubscribeFromPush((endpoint) =>
    api.request<void>('/push/subscriptions', { method: 'DELETE', body: { endpoint } }),
  )
  // Un fallo de la baja NO impide salir: quien pulsa «cerrar sesión» tiene que
  // salir aunque no haya red. La fila que quede se recicla sola — el siguiente
  // que entre en este navegador reclama el endpoint en el POST.
  if (baja === 'failed') {
    console.error('[auth] no se pudo dar de baja el push al cerrar sesión')
  }
  // El «apagué los avisos en esta tablet» es de quien lo decidió, no del
  // navegador. Si sobreviviera al cierre de sesión, el siguiente turno
  // arrancaría mudo sin que nadie pueda saber por qué: el estado se vería
  // exactamente igual que un equipo recién estrenado. Ver `APAGADO_KEY`.
  olvidarApagado()
  await signOutLocal(getSupabaseBrowser())
}
