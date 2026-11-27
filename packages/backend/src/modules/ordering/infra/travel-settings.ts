import type { TypedSupabaseClient } from '@tindivo/supabase'
import { travelMinutesFrom } from '../domain/travel-minutes'

/** Lee el trayecto de `app_settings`; un fallo de lectura deja el rango en `null`, no rompe el pedido. */
export async function readTravelMinutes(
  db: TypedSupabaseClient,
): Promise<{ min: number; max: number } | null> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'timers').maybeSingle()
  return travelMinutesFrom(data?.value)
}
