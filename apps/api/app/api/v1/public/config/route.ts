import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { toMoneyText } from '@/lib/mappers/money-text'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Las claves de `app_settings` que esta ruta publica. Son un SUBCONJUNTO del
 * whitelist de la policy `as_public_read`: lo que la web ya leía sin sesión.
 * Se lee con service role y esta lista explícita (como `GET /config`), de modo
 * que añadir una clave secreta a la tabla nunca la publica sola.
 */
const PUBLIC_KEYS = [
  'coverage',
  'coverage_polygon',
  'location_validation',
  'delivery_bands',
  'prepay_threshold',
  'max_cash_bill',
  'max_change',
] as const

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() === '' ? Number.NaN : Number(v)
  return typeof v === 'boolean' || v === null || !Number.isFinite(n) ? null : n
}

/** Toma `keys` de `v` como números; si falta alguno, el bloque entero es `null`. */
function numbers<K extends string>(v: unknown, keys: readonly K[]): Record<K, number> | null {
  if (!isObj(v)) return null
  const out = {} as Record<K, number>
  for (const k of keys) {
    const n = num(v[k])
    if (n === null) return null
    out[k] = n
  }
  return out
}

/**
 * GET /public/config: cobertura, bandas de envío, umbral de prepago y topes de
 * efectivo. Sin sesión. NO es `GET /config` (compatibilidad de versión, MV3).
 * Un bloque ausente o malformado sale `null`: la app decide su respaldo.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { data, error } = await createServiceClient()
      .from('app_settings')
      .select('key,value')
      .in('key', [...PUBLIC_KEYS])
    if (error) throw new Error(error.message)
    const s: Record<string, unknown> = {}
    for (const row of data ?? []) s[row.key] = row.value

    const poly = isObj(s.coverage_polygon) ? s.coverage_polygon.polygon : null
    const points = Array.isArray(poly) ? poly.map((p) => numbers(p, ['lat', 'lng'] as const)) : null
    const coveragePolygon = points && points.every((p) => p !== null) ? points : null

    const bands = isObj(s.delivery_bands)
      ? { near: toMoneyText(s.delivery_bands.near), far: toMoneyText(s.delivery_bands.far) }
      : null

    return ok(
      {
        coverage: numbers(s.coverage, ['centerLat', 'centerLng', 'radiusKm'] as const),
        coveragePolygon,
        locationValidation: numbers(s.location_validation, [
          'timeoutMs',
          'maxAccuracyM',
          'normalRadiusKm',
          'warningRadiusKm',
        ] as const),
        deliveryBands: bands?.near && bands.far ? { near: bands.near, far: bands.far } : null,
        prepayThreshold: toMoneyText(s.prepay_threshold),
        maxCashBill: toMoneyText(s.max_cash_bill),
        maxChange: toMoneyText(s.max_change),
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
