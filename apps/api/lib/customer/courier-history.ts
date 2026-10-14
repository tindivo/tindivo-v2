import { encodeCursor, keysetFilter } from '@/lib/http/cursor'
import { createServiceClient } from '@/lib/supabase/service'
import { createUserClient } from '@/lib/supabase/user'
import { parsePage } from './history'

interface CourierRow {
  id: string
  short_id: string
  order_number: number
  status: string
  cancel_reason: string | null
  origin_name: string | null
  origin_phone: string | null
  origin_lat: number
  origin_lng: number
  origin_reference_text: string
  destination_name: string | null
  destination_phone: string | null
  destination_lat: number
  destination_lng: number
  destination_reference_text: string
  item_description: string
  is_fragile: boolean
  payer: string
  driver_id: string | null
  fee_amount: number
  created_at: string
  delivered_at: string | null
}

const COURIER_COLUMNS =
  'id,short_id,order_number,status,cancel_reason,origin_name,origin_phone,origin_lat,origin_lng,origin_reference_text,destination_name,destination_phone,destination_lat,destination_lng,destination_reference_text,item_description,is_fragile,payer,driver_id,fee_amount,created_at,delivered_at' as const

/** Lo que el sistema escribe cuando nadie puso un nombre: no es un contacto reconocible. */
const FALLBACK_NAMES = new Set(['quien entrega', 'quien recibe'])
const MAX_CONTACTS = 6
const CONTACT_WINDOW = 50

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function toPoint(
  name: string | null,
  phone: string | null,
  lat: number,
  lng: number,
  reference: string,
) {
  return {
    name: name ?? '',
    phone,
    coordinates: { lat: Number(lat), lng: Number(lng) },
    referenceText: reference,
  }
}

const originOf = (r: CourierRow) =>
  toPoint(r.origin_name, r.origin_phone, r.origin_lat, r.origin_lng, r.origin_reference_text)
const destinationOf = (r: CourierRow) =>
  toPoint(
    r.destination_name,
    r.destination_phone,
    r.destination_lat,
    r.destination_lng,
    r.destination_reference_text,
  )

/**
 * Los sitios y personas que más repite esta cliente en sus últimas 50
 * solicitudes. Mismo contacto = mismo celular o, sin celular, misma referencia.
 * Entrega y recojo se mezclan: la casa de la mamá es el destino un día y el
 * recojo otro. Cuentan también las canceladas (el sitio y la persona siguen
 * siendo los mismos).
 */
function frequentContacts(rows: CourierRow[]) {
  const contacts = new Map<
    string,
    ReturnType<typeof toPoint> & { timesUsed: number; lastUsedAt: string }
  >()
  for (const r of rows) {
    for (const p of [destinationOf(r), originOf(r)]) {
      const digits = (p.phone ?? '').replace(/\D/g, '').slice(-9)
      const key = digits.length === 9 ? `tel:${digits}` : `ref:${fold(p.referenceText)}`
      if (key === 'ref:') continue
      const name = FALLBACK_NAMES.has(fold(p.name)) ? '' : p.name.trim()
      const seen = contacts.get(key)
      if (seen) {
        seen.timesUsed += 1
        if (!seen.name && name) seen.name = name
      } else {
        // Las filas llegan de la más reciente a la más antigua: la primera vez
        // que se ve un contacto es su último uso, y su punto el más reciente.
        contacts.set(key, { ...p, name, timesUsed: 1, lastUsedAt: r.created_at })
      }
    }
  }
  return [...contacts.values()]
    .sort((a, b) => b.timesUsed - a.timesUsed || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, MAX_CONTACTS)
}

/**
 * Nombre del motorizado de cada entrega, por `driver_id`.
 *
 * `drivers` tiene RLS (0004): solo el admin y el propio motorizado la leen, el
 * cliente no, aunque la entrega sea suya. Por eso se lee con service_role; la
 * propiedad ya está verificada porque los `driverIds` salen de filas que la
 * policy `co_customer_select` dejó pasar con la sesión del cliente. Reemplaza a
 * `get_courier_tracking`, que se cerró a anon/authenticated (0262).
 */
async function driverNames(driverIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (driverIds.length === 0) return names
  const { data, error } = await createServiceClient()
    .from('drivers')
    .select('id,full_name')
    .in('id', driverIds)
  if (error) throw new Error(error.message)
  for (const d of data ?? []) names.set(d.id, d.full_name)
  return names
}

/**
 * Una página de las solicitudes de Entregas de la cliente de la sesión, y sus
 * contactos frecuentes (solo en la primera página). Con la sesión del usuario:
 * la policy `co_customer_select` limita todo a lo suyo.
 */
export async function listCustomerCourierOrders(token: string, userId: string, req: Request) {
  const { limit, cursor } = parsePage(req)
  const asUser = createUserClient(token)
  let query = asUser
    .from('courier_orders')
    .select(COURIER_COLUMNS)
    .eq('customer_user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (cursor) query = query.or(keysetFilter(cursor))

  const contactsQuery = cursor
    ? Promise.resolve({ data: [] as unknown[], error: null })
    : asUser
        .from('courier_orders')
        .select(COURIER_COLUMNS)
        .eq('customer_user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(CONTACT_WINDOW)

  const [{ data, error }, contactsRes] = await Promise.all([query, contactsQuery])
  if (error) throw new Error(error.message)
  if (contactsRes.error) throw new Error(contactsRes.error.message)

  const rows = (data ?? []) as unknown as CourierRow[]
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  const names = await driverNames([
    ...new Set(page.map((r) => r.driver_id).filter((id): id is string => !!id)),
  ])

  return {
    items: page.map((r) => ({
      id: r.id,
      shortId: r.short_id,
      orderNumber: r.order_number,
      status: r.status,
      cancelReason: r.cancel_reason,
      origin: originOf(r),
      destination: destinationOf(r),
      itemDescription: r.item_description,
      isFragile: r.is_fragile,
      payer: r.payer,
      driverName: (r.driver_id && names.get(r.driver_id)) || null,
      feeAmount: (Math.round(Number(r.fee_amount) * 100) / 100).toFixed(2),
      createdAt: r.created_at,
      deliveredAt: r.delivered_at,
    })),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id })
        : null,
    frequentContacts: frequentContacts((contactsRes.data ?? []) as unknown as CourierRow[]),
  }
}
