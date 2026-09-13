'use client'

import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * UNA SOLA CONSULTA PARA LAS CUATRO CLAVES DE `app_settings` QUE PIDE EL MAPA.
 *
 * `coverage.ts`, `delivery-fee.ts` y el propio `MapPicker` pedían cada una su
 * clave por separado (`coverage`, `coverage_polygon`, `delivery_bands`,
 * `location_validation`): cuatro round-trips a la misma tabla, en paralelo
 * pero cada uno pagando el mismo viaje de ida y vuelta. En la cobertura móvil
 * de un pueblo eso no es gratis — cada conexión compite por el mismo ancho de
 * banda. Un solo `.in('key', …)` trae las cuatro filas en un viaje.
 *
 * Memoizado por sesión de página, igual que las funciones que lo consumen.
 */
const KEYS = ['coverage', 'coverage_polygon', 'delivery_bands', 'location_validation'] as const

export type AppSettingsRow = Record<string, unknown>

let cached: Promise<AppSettingsRow> | null = null

async function fetchBatch(): Promise<AppSettingsRow> {
  try {
    const { data } = await getSupabaseBrowser()
      .from('app_settings')
      .select('key,value')
      .in('key', KEYS)
    const out: AppSettingsRow = {}
    for (const row of data ?? []) {
      out[row.key] = row.value
    }
    return out
  } catch {
    // Vacío: cada llamador cae en su propio fallback, igual que antes.
    return {}
  }
}

/** Las cuatro filas de `app_settings` que usa el selector de ubicación, en un solo viaje. */
export function getAppSettingsBatch(): Promise<AppSettingsRow> {
  if (!cached) cached = fetchBatch()
  return cached
}
