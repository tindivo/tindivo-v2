'use client'

import type { Landmark } from '@tindivo/map'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * LAS REFERENCIAS DEL PUEBLO, PARA QUIEN NO RECONOCE SU CALLE POR EL NOMBRE.
 *
 * El mapa de elegir ubicación era un lienzo de calles rotuladas, y en San
 * Jacinto eso no basta: la gente ubica su casa por la botica de la esquina o
 * por el colegio, no por "Calle Iquitos". Estos puntos los carga el admin a
 * mano (`/mapa-referencias`, tabla `map_landmarks`, migración 0208).
 *
 * SE LEE DIRECTO DESDE EL NAVEGADOR, sin pasar por la API, igual que
 * `coverage.ts`: es una tabla de solo lectura detrás de la policy
 * `ml_public_read` (que ya filtra por `active`), así que meterla en un
 * endpoint solo sumaría el medio segundo de piso que cuesta el salto a la API
 * sin ganar ni un control más.
 */
// La forma y el dibujo viven en `@tindivo/map` (los comparte el mapa del
// motorizado); aquí queda solo la lectura.
export { LANDMARK_STYLE, type Landmark } from '@tindivo/map'

let cached: Promise<Landmark[]> | null = null

async function fetchLandmarks(): Promise<Landmark[]> {
  try {
    const { data } = await getSupabaseBrowser()
      .from('map_landmarks')
      .select('id,name,category,lat,lng')
      // Redundante con la policy, y aun así explícito: si algún día la RLS se
      // abre, esta pantalla no empieza a pintar sola los puntos apagados.
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
    // Un fallo acá no puede impedir elegir la ubicación: son una ayuda, no un
    // requisito. Sin referencias, el mapa es exactamente el de antes.
    return []
  }
}

/** Referencias activas, memoizadas por sesión de página (como `getCoverage`). */
export function getLandmarks(): Promise<Landmark[]> {
  if (!cached) cached = fetchLandmarks()
  return cached
}
