'use client'

import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface Coverage {
  centerLat: number
  centerLng: number
  radiusKm: number
}

// app_settings.coverage is anon-readable (RLS as_public_read). Fallback mirrors the
// seed (0006_seed_app_settings.sql) so the map still renders if the fetch fails.
const FALLBACK: Coverage = { centerLat: -9.1547, centerLng: -78.5042, radiusKm: 3 }

let cached: Promise<Coverage> | null = null

async function fetchCoverage(): Promise<Coverage> {
  try {
    const { data } = await getSupabaseBrowser()
      .from('app_settings')
      .select('value')
      .eq('key', 'coverage')
      .maybeSingle()
    const v = data?.value as Partial<Coverage> | null
    if (
      v &&
      typeof v.centerLat === 'number' &&
      typeof v.centerLng === 'number' &&
      typeof v.radiusKm === 'number'
    ) {
      return { centerLat: v.centerLat, centerLng: v.centerLng, radiusKm: v.radiusKm }
    }
    return FALLBACK
  } catch {
    return FALLBACK
  }
}

/** Centro/radio de cobertura desde app_settings (memoizado por sesión de página). */
export function getCoverage(): Promise<Coverage> {
  if (!cached) cached = fetchCoverage()
  return cached
}

/** Distancia de círculo máximo en km entre dos puntos lat/lng (haversine). */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
