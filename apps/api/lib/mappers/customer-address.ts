/**
 * Libreta de direcciones del cliente: la fila y las dos reglas del PUNTO.
 *
 * Las reglas son las que la web tenía en `apps/customer/lib/address-record.ts`
 * (`sealLocation`), traídas al servidor para que la app nativa no las copie:
 *   · el sello (`location_confirmed_at`, `location_accuracy_m`) lo mueve el
 *     PUNTO, no el formulario: si la coordenada no cambió, el sello viejo sigue
 *     siendo el bueno; si cambió, se sella ahora;
 *   · sin punto no hay sello (no se inventa una confirmación sobre nada).
 */

export interface AddressRow {
  id: string
  label: string
  line: string | null
  reference: string
  coordinates_lat: number | null
  coordinates_lng: number | null
  is_default: boolean
  location_confirmed_at: string | null
  location_accuracy_m: number | null
  created_at: string
  updated_at: string
}

export const ADDRESS_COLUMNS =
  'id,label,line,reference,coordinates_lat,coordinates_lng,is_default,location_confirmed_at,location_accuracy_m,created_at,updated_at' as const

export function toAddressDto(row: AddressRow) {
  const hasPoint = row.coordinates_lat !== null && row.coordinates_lng !== null
  return {
    id: row.id,
    label: row.label,
    line: row.line,
    reference: row.reference,
    coordinates: hasPoint
      ? { lat: Number(row.coordinates_lat), lng: Number(row.coordinates_lng) }
      : null,
    isDefault: row.is_default,
    locationConfirmedAt: row.location_confirmed_at,
    locationAccuracyM: row.location_accuracy_m === null ? null : Number(row.location_accuracy_m),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface PointSeal {
  lat: number | null
  lng: number | null
  confirmedAt: string | null
  accuracyM: number | null
}

/** `numeric(10,7)`: 7 decimales. Se redondea igual antes de comparar. */
const round7 = (n: number): number => Math.round(n * 1e7) / 1e7

/**
 * El punto y su sello tras una escritura.
 *
 * `next` = lo que se pide (`null` = borrar el punto); `previous` = la fila de
 * antes (o `null` en un alta).
 */
export function sealPoint(
  previous: AddressRow | null,
  next: { lat: number; lng: number; accuracyM?: number } | null,
  nowIso: string,
): PointSeal {
  if (next === null) return { lat: null, lng: null, confirmedAt: null, accuracyM: null }
  const lat = round7(next.lat)
  const lng = round7(next.lng)
  const samePoint =
    previous !== null &&
    previous.location_confirmed_at !== null &&
    previous.coordinates_lat !== null &&
    previous.coordinates_lng !== null &&
    round7(Number(previous.coordinates_lat)) === lat &&
    round7(Number(previous.coordinates_lng)) === lng
  if (samePoint) {
    return {
      lat,
      lng,
      confirmedAt: previous.location_confirmed_at,
      accuracyM:
        previous.location_accuracy_m === null ? null : Number(previous.location_accuracy_m),
    }
  }
  return { lat, lng, confirmedAt: nowIso, accuracyM: next.accuracyM ?? null }
}

/** Forma mínima del cliente RPC que estas rutas usan (la función es de la 0256, aún sin tipos generados). */
export type LooseRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
