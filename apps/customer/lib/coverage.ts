'use client'

import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface Coverage {
  centerLat: number
  centerLng: number
  radiusKm: number
}

export interface LocationValidation {
  centerLat: number
  centerLng: number
  normalRadiusKm: number
  warningRadiusKm: number
  maxAccuracyM: number
  timeoutMs: number
}

// app_settings.coverage is anon-readable (RLS as_public_read). Fallback mirrors the
// seed (0006_seed_app_settings.sql) so the map still renders if the fetch fails.
const FALLBACK: Coverage = { centerLat: -9.1547, centerLng: -78.5042, radiusKm: 3 }
const LOCATION_FALLBACK: LocationValidation = {
  centerLat: -9.1547,
  centerLng: -78.5042,
  normalRadiusKm: 10,
  warningRadiusKm: 30,
  maxAccuracyM: 500,
  timeoutMs: 15_000,
}

let cached: Promise<Coverage> | null = null
let cachedLocation: Promise<LocationValidation> | null = null

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

async function fetchLocationValidation(): Promise<LocationValidation> {
  try {
    const { data } = await getSupabaseBrowser()
      .from('app_settings')
      .select('value')
      .eq('key', 'location_validation')
      .maybeSingle()
    const v = data?.value as Partial<LocationValidation> | null
    if (
      v &&
      typeof v.centerLat === 'number' &&
      typeof v.centerLng === 'number' &&
      typeof v.normalRadiusKm === 'number' &&
      typeof v.warningRadiusKm === 'number'
    ) {
      return {
        centerLat: v.centerLat,
        centerLng: v.centerLng,
        normalRadiusKm: v.normalRadiusKm,
        warningRadiusKm: v.warningRadiusKm,
        maxAccuracyM:
          typeof v.maxAccuracyM === 'number' ? v.maxAccuracyM : LOCATION_FALLBACK.maxAccuracyM,
        timeoutMs: typeof v.timeoutMs === 'number' ? v.timeoutMs : LOCATION_FALLBACK.timeoutMs,
      }
    }
    return LOCATION_FALLBACK
  } catch {
    return LOCATION_FALLBACK
  }
}

export function getLocationValidation(): Promise<LocationValidation> {
  if (!cachedLocation) cachedLocation = fetchLocationValidation()
  return cachedLocation
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

export type LatLng = { lat: number; lng: number }

export interface CoveragePolygon {
  /** Anillo de vértices en orden (sin cerrar: el último no repite el primero). */
  polygon: LatLng[]
}

let cachedPolygon: Promise<CoveragePolygon | null> | null = null

function isLatLng(p: unknown): p is LatLng {
  return (
    !!p &&
    typeof p === 'object' &&
    typeof (p as LatLng).lat === 'number' &&
    typeof (p as LatLng).lng === 'number'
  )
}

async function fetchCoveragePolygon(): Promise<CoveragePolygon | null> {
  try {
    const { data } = await getSupabaseBrowser()
      .from('app_settings')
      .select('value')
      .eq('key', 'coverage_polygon')
      .maybeSingle()
    const raw = (data?.value as { polygon?: unknown } | null)?.polygon
    if (!Array.isArray(raw)) return null
    const ring = raw.filter(isLatLng).map((p) => ({ lat: p.lat, lng: p.lng }))
    // Un polígono válido necesita al menos 3 vértices.
    return ring.length >= 3 ? { polygon: ring } : null
  } catch {
    return null
  }
}

/** Polígono de cobertura desde app_settings (memoizado). null = no configurado. */
export function getCoveragePolygon(): Promise<CoveragePolygon | null> {
  if (!cachedPolygon) cachedPolygon = fetchCoveragePolygon()
  return cachedPolygon
}

/**
 * ¿El punto cae dentro del polígono? Algoritmo ray-casting (even-odd rule): traza un
 * rayo horizontal desde el punto y cuenta cruces con los lados; impar = dentro. Tratamos
 * lng como x y lat como y (la distorsión es despreciable a escala de un pueblo).
 */
export function pointInPolygon(point: LatLng, ring: LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]
    const pj = ring[j]
    if (!pi || !pj) continue
    const intersects =
      pi.lat > point.lat !== pj.lat > point.lat &&
      point.lng < ((pj.lng - pi.lng) * (point.lat - pi.lat)) / (pj.lat - pi.lat) + pi.lng
    if (intersects) inside = !inside
  }
  return inside
}
