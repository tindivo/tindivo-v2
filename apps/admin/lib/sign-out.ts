import { signOutLocal } from '@tindivo/supabase'
import { unsubscribeFromPush } from '@tindivo/ui'
import { api } from './api'
import { getSupabaseBrowser } from './supabase/client'

/**
 * Única salida de sesión del panel de administración: desengancha el
 * dispositivo de los avisos y cierra SU sesión, sin tocar las de los demás.
 *
 * El orden no es negociable: `DELETE /push/subscriptions` va autenticado, así
 * que después del `signOutLocal` ya no hay JWT con el que borrar la fila y el
 * navegador seguiría recibiendo avisos de una cuenta de la que ya se salió.
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
}
