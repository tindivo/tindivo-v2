import { CustomerPageQuerySchema } from '@tindivo/contracts'
import { decodeCursor, encodeCursor, keysetFilter } from '@/lib/http/cursor'
import {
  ORDER_SUMMARY_COLUMNS,
  type OrderSummaryRow,
  toOrderSummaryDto,
} from '@/lib/mappers/customer-orders'
import { createServiceClient } from '@/lib/supabase/service'
import { createUserClient } from '@/lib/supabase/user'

/** Lee `?limit=&cursor=` de la URL y lo valida (tope `CUSTOMER_PAGE_MAX`). */
export function parsePage(req: Request) {
  const params = new URL(req.url).searchParams
  const raw: Record<string, string> = {}
  for (const key of ['limit', 'cursor']) {
    const v = params.get(key)
    if (v !== null) raw[key] = v
  }
  const { limit, cursor } = CustomerPageQuerySchema.parse(raw)
  return { limit, cursor: cursor ? decodeCursor(cursor) : null }
}

/**
 * Una página del historial de pedidos de comida del cliente de la sesión.
 *
 * Con la sesión del usuario: la RLS (`ord_customer_read`, `coi_participant_read`)
 * limita todo a lo suyo, y la función no recibe ningún id de usuario. Se pide
 * una fila de más para saber si hay página siguiente sin un `count`.
 */
export async function listCustomerOrders(token: string, req: Request) {
  const { limit, cursor } = parsePage(req)
  let query = createUserClient(token)
    .from('orders')
    .select(ORDER_SUMMARY_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (cursor) query = query.or(keysetFilter(cursor))

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as OrderSummaryRow[]
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]

  // El cliente no lee `businesses` por RLS: los nombres salen del servicio,
  // solo de los negocios de SUS pedidos.
  const businessIds = [...new Set(page.map((r) => r.business_id))]
  const names = new Map<string, string>()
  if (businessIds.length > 0) {
    const { data: businesses, error: bizErr } = await createServiceClient()
      .from('businesses')
      .select('id,name')
      .in('id', businessIds)
    if (bizErr) throw new Error(bizErr.message)
    for (const b of businesses ?? []) names.set(b.id, b.name)
  }

  return {
    items: page.map((r) => toOrderSummaryDto(r, names.get(r.business_id) ?? null)),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id })
        : null,
  }
}
