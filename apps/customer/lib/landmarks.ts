'use client'

import type { MapLandmarkCategory } from '@tindivo/contracts'
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
export interface Landmark {
  id: string
  name: string
  category: MapLandmarkCategory
  lat: number
  lng: number
}

/**
 * ICONO Y COLOR POR CATEGORÍA, COMO EN CUALQUIER MAPA QUE LA GENTE YA SABE LEER.
 *
 * Un disco de color sin más no dice nada: hay que leer el nombre para saber
 * qué es, y entonces el color sobra. El glifo sí se lee de un vistazo —una
 * cruz es una botica en cualquier mapa del mundo— y es lo que hace que estas
 * referencias funcionen incluso antes de acercarse lo bastante para que
 * aparezcan los nombres.
 *
 * Los nombres son de Material Symbols Rounded, el único set del proyecto
 * (`DECISIONS.md §1`), y la fuente ya la carga `app/layout.tsx`.
 *
 * Los rótulos del panel ("Salud (botica, posta)") NO se reutilizan acá: allá
 * nombran una opción de un desplegable, y aquí el nombre propio del sitio ya
 * está escrito al lado del icono.
 */
export const LANDMARK_STYLE: Record<MapLandmarkCategory, { color: string; icon: string }> = {
  salud: { color: '#e11d48', icon: 'local_pharmacy' },
  mercado: { color: '#d97706', icon: 'storefront' },
  educacion: { color: '#2563eb', icon: 'school' },
  religioso: { color: '#7c3aed', icon: 'church' },
  deporte: { color: '#0891b2', icon: 'sports_soccer' },
  recreacion: { color: '#16a34a', icon: 'park' },
  gobierno: { color: '#475569', icon: 'account_balance' },
  otro: { color: '#64748b', icon: 'place' },
}

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
