import type { CourierPayer } from '@tindivo/contracts'
import type { CourierPoint } from '../types'
import { stripPeCountryCode } from './phone'

interface RouteRow {
  origin_name: string | null
  origin_phone: string | null
  origin_lat: number | string | null
  origin_lng: number | string | null
  origin_reference_text: string | null
  destination_name: string | null
  destination_phone: string | null
  destination_lat: number | string | null
  destination_lng: number | string | null
  destination_reference_text: string | null
  item_description: string | null
  payer: CourierPayer
  status: string
}

export interface CourierRoute {
  origin: CourierPoint
  destination: CourierPoint
  itemDescription: string
  payer: CourierPayer
}

const MAX_ROUTES = 3
const MAX_POINTS = 6

function toPoint(
  name: string | null,
  phone: string | null,
  lat: number | string | null,
  lng: number | string | null,
  reference: string | null,
): CourierPoint | null {
  if (lat == null || lng == null) return null
  const n = (name ?? '').trim()
  return {
    contactName: n,
    contactPhone: stripPeCountryCode(phone ?? ''),
    coordinates: { lat: Number(lat), lng: Number(lng) },
    accuracyM: null,
    referenceText: (reference ?? '').trim(),
    label: n || undefined,
  }
}

/** ~11 m: dos pines a menos de eso son la misma puerta. */
function spot(p: CourierPoint): string {
  const c = p.coordinates
  return c ? `${c.lat.toFixed(4)},${c.lng.toFixed(4)}` : ''
}

/**
 * Las últimas rutas distintas que esta persona pidió, de la más reciente a la
 * más antigua, para repetirlas de un toque: en un pueblo, el que manda algo
 * suele mandarlo otra vez al mismo sitio (la botica a la casa de la mamá).
 *
 * Trae TODO lo de la ruta (puntos, referencias, contactos, qué y quién paga):
 * repetir es llegar a «Pedir entrega» con todo puesto, y que la persona solo
 * revise. Solo las que se ENTREGARON: una cancelada o que nadie atendió no es
 * una ruta que valga la pena ofrecer de nuevo.
 */
export function recentRoutes(rows: readonly RouteRow[]): CourierRoute[] {
  const seen = new Set<string>()
  const out: CourierRoute[] = []
  for (const r of rows) {
    if (r.status !== 'delivered') continue
    const origin = toPoint(
      r.origin_name,
      r.origin_phone,
      r.origin_lat,
      r.origin_lng,
      r.origin_reference_text,
    )
    const destination = toPoint(
      r.destination_name,
      r.destination_phone,
      r.destination_lat,
      r.destination_lng,
      r.destination_reference_text,
    )
    if (!origin || !destination) continue
    const key = `${spot(origin)}>${spot(destination)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      origin,
      destination,
      itemDescription: (r.item_description ?? '').trim(),
      payer: r.payer,
    })
    if (out.length >= MAX_ROUTES) break
  }
  return out
}

/**
 * Los sitios donde esta persona ya recogió o entregó, con su contacto, para la
 * lupa del pin: elegir uno deja puesto el punto, la referencia y quién está
 * ahí. Aquí sí cuentan las canceladas: el sitio y la persona siguen siendo
 * los mismos. Entrega y recojo se mezclan, como en `recentContacts`: la casa
 * de la mamá es el destino un día y el recojo otro.
 */
export function recentPoints(rows: readonly RouteRow[]): CourierPoint[] {
  const seen = new Set<string>()
  const out: CourierPoint[] = []
  const push = (p: CourierPoint | null) => {
    if (!p || out.length >= MAX_POINTS) return
    const key = spot(p)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ ...p, label: p.label || p.referenceText })
  }
  for (const r of rows) {
    push(
      toPoint(
        r.destination_name,
        r.destination_phone,
        r.destination_lat,
        r.destination_lng,
        r.destination_reference_text,
      ),
    )
    push(
      toPoint(r.origin_name, r.origin_phone, r.origin_lat, r.origin_lng, r.origin_reference_text),
    )
    if (out.length >= MAX_POINTS) break
  }
  return out
}
