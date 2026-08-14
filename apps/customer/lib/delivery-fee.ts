'use client'

import { type LatLng, pointInPolygon } from '@/lib/coverage'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export type DistanceBand = 'near' | 'far'

export interface DeliveryBands {
  near: number
  far: number
}

/**
 * Espejo de `delivery_bands` (0086). Solo se usa si la consulta falla: la tabla
 * es legible por `anon` vía la whitelist `as_public_read`, así que en la práctica
 * siempre responde.
 */
const FALLBACK_BANDS: DeliveryBands = { near: 2.0, far: 2.5 }

let cachedBands: Promise<DeliveryBands> | null = null
let cachedZones: Promise<LatLng[][]> | null = null

async function fetchBands(): Promise<DeliveryBands> {
  try {
    const { data } = await getSupabaseBrowser()
      .from('app_settings')
      .select('value')
      .eq('key', 'delivery_bands')
      .maybeSingle()
    const v = data?.value as Partial<DeliveryBands> | null
    if (v && typeof v.near === 'number' && typeof v.far === 'number') {
      return { near: v.near, far: v.far }
    }
    return FALLBACK_BANDS
  } catch {
    return FALLBACK_BANDS
  }
}

/** Tarifas de envío por banda (memoizado por sesión de página). */
export function getDeliveryBands(): Promise<DeliveryBands> {
  if (!cachedBands) cachedBands = fetchBands()
  return cachedBands
}

function isLatLng(p: unknown): p is LatLng {
  return (
    !!p &&
    typeof p === 'object' &&
    typeof (p as LatLng).lat === 'number' &&
    typeof (p as LatLng).lng === 'number'
  )
}

/**
 * Los anillos de las zonas lejanas ACTIVAS.
 *
 * La policy `dz_public_read` (0161) solo deja ver las activas, así que aquí no
 * hace falta filtrar: lo que llega es lo que cobra.
 */
async function fetchFarZones(): Promise<LatLng[][]> {
  try {
    const { data } = await getSupabaseBrowser()
      .from('delivery_zones')
      .select('polygon')
      .eq('kind', 'far')
    return (data ?? [])
      .map((z) => {
        const raw = z.polygon
        if (!Array.isArray(raw)) return []
        return raw.filter(isLatLng).map((p) => ({ lat: p.lat, lng: p.lng }))
      })
      .filter((ring) => ring.length >= 3)
  } catch {
    // Sin zonas, todo cae en `near`. Es el defecto correcto: ante un fallo de
    // red, cobrar de menos y que el servidor corrija es preferible a enseñarle
    // al cliente un recargo que quizá no exista.
    return []
  }
}

/** Zonas lejanas activas (memoizado por sesión de página). */
export function getFarZones(): Promise<LatLng[][]> {
  if (!cachedZones) cachedZones = fetchFarZones()
  return cachedZones
}

/**
 * La banda de un punto, en el navegador.
 *
 * ES SOLO PARA MOSTRAR. Quien decide de verdad es `delivery_band_for_point` en
 * la base, dentro de `create_customer_order` (0162) — el navegador no manda la
 * banda ni el precio. Esto existe para que el cliente vea lo que va a pagar
 * ANTES de confirmar, no para calcularlo.
 *
 * Usa el mismo ray-casting que la cobertura, que a su vez es el mismo algoritmo
 * que `point_in_ring` en SQL. Si los dos dejaran de coincidir, el cliente vería
 * un número y se le cobraría otro.
 */
export function bandForPoint(point: LatLng | null, zones: LatLng[][]): DistanceBand {
  if (!point) return 'near'
  return zones.some((ring) => pointInPolygon(point, ring)) ? 'far' : 'near'
}
