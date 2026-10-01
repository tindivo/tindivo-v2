'use client'

import type { Landmark } from '@tindivo/map'
import { getSupabaseBrowser } from '@/lib/supabase/client'

let cached: Promise<Landmark[]> | null = null

async function fetchLandmarks(): Promise<Landmark[]> {
  try {
    const { data } = await getSupabaseBrowser()
      .from('map_landmarks')
      .select('id,name,category,lat,lng')
      .eq('active', true)
    if (!data) return []
    return data.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      lat: Number(r.lat),
      lng: Number(r.lng),
    }))
  } catch {
    // Son una ayuda para orientarse: sin ellas el mapa sigue sirviendo.
    return []
  }
}

/**
 * Las referencias del pueblo (`map_landmarks`): las mismas que ve el cliente al
 * fijar su punto. Que el motorizado vea «la botica», «el colegio» donde el
 * cliente los vio es lo que hace que «frente a la botica» signifique lo mismo
 * para los dos. Una lectura por sesión de página, como en el cliente.
 */
export function getLandmarks(): Promise<Landmark[]> {
  if (!cached) cached = fetchLandmarks()
  return cached
}
