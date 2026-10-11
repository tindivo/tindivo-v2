import { CreateCustomerAddressRequestSchema } from '@tindivo/contracts'
import { requireRole } from '@/lib/http/auth'
import { handleOptions } from '@/lib/http/cors'
import { privateHeaders } from '@/lib/http/private-response'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import {
  ADDRESS_COLUMNS,
  type AddressRow,
  type LooseRpc,
  sealPoint,
  toAddressDto,
} from '@/lib/mappers/customer-address'
import { createUserClient } from '@/lib/supabase/user'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * GET /customer/addresses: la libreta del cliente de la sesión.
 *
 * Se lee con la sesión del usuario: la policy `ca_self_all` limita las filas a
 * las suyas y la ruta no recibe ningún id de usuario. Una libreta es corta, así
 * que no pagina; el tope de 100 es una red, no una página.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token, user } = await requireRole(req, 'customer')
    const { data, error } = await createUserClient(token)
      .from('customer_addresses')
      .select(ADDRESS_COLUMNS)
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(100)
    if (error) throw new Error(error.message)
    return ok(
      { items: ((data ?? []) as AddressRow[]).map(toAddressDto) },
      { headers: privateHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/**
 * POST /customer/addresses: guarda una dirección.
 *
 * El alta y, si hay que hacerla predeterminada, el despeje de la anterior van en
 * UNA transacción (`customer_address_save`, 0256): nunca quedan dos, ni ninguna
 * cuando debía haber una.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token, user } = await requireRole(req, 'customer')
    const body = CreateCustomerAddressRequestSchema.parse(await req.json())
    const asUser = createUserClient(token)

    const seal = sealPoint(
      null,
      body.coordinates ? { ...body.coordinates, accuracyM: body.accuracyM } : null,
      new Date().toISOString(),
    )
    const rpc = asUser.rpc.bind(asUser) as unknown as LooseRpc
    const { data: id, error } = await rpc('customer_address_save', {
      p_id: null,
      p_label: body.label,
      p_line: body.line ?? null,
      p_reference: body.reference,
      p_lat: seal.lat,
      p_lng: seal.lng,
      p_location_confirmed_at: seal.confirmedAt,
      p_location_accuracy_m: seal.accuracyM,
      p_make_default: body.isDefault ?? null,
    })
    if (error || typeof id !== 'string') throw new Error(error?.message ?? 'sin id')

    const { data: row, error: readErr } = await asUser
      .from('customer_addresses')
      .select(ADDRESS_COLUMNS)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (readErr) throw new Error(readErr.message)
    return ok(toAddressDto(row as AddressRow), { status: 201, headers: privateHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
