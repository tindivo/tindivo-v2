import { UpdateCustomerAddressRequestSchema, UuidSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
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

const NOT_FOUND = 'Esa dirección no existe'

/**
 * PATCH /customer/addresses/{id}: edita una dirección PROPIA.
 *
 * Una ajena responde 404, igual que una que no existe: la policy `ca_self_all`
 * no la deja ver, y la función `customer_address_save` filtra además por
 * `auth.uid()`. Lo que no se manda no se toca; el sello del punto lo mueve el
 * punto, no el formulario (ver `sealPoint`).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token } = await requireRole(req, 'customer')
    const id = UuidSchema.parse((await params).id)
    const body = UpdateCustomerAddressRequestSchema.parse(await req.json())
    const asUser = createUserClient(token)

    const { data: previous, error: readErr } = await asUser
      .from('customer_addresses')
      .select(ADDRESS_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (readErr) throw new Error(readErr.message)
    if (!previous) throw new DomainError(NOT_FOUND, 'not_found')
    const prev = previous as AddressRow

    // El punto: ausente = se queda como estaba (sello incluido).
    const seal =
      body.coordinates === undefined
        ? {
            lat: prev.coordinates_lat === null ? null : Number(prev.coordinates_lat),
            lng: prev.coordinates_lng === null ? null : Number(prev.coordinates_lng),
            confirmedAt: prev.location_confirmed_at,
            accuracyM: prev.location_accuracy_m === null ? null : Number(prev.location_accuracy_m),
          }
        : sealPoint(
            prev,
            body.coordinates ? { ...body.coordinates, accuracyM: body.accuracyM } : null,
            new Date().toISOString(),
          )

    const rpc = asUser.rpc.bind(asUser) as unknown as LooseRpc
    const { error } = await rpc('customer_address_save', {
      p_id: id,
      p_label: body.label ?? prev.label,
      p_line: body.line ?? prev.line,
      p_reference: body.reference ?? prev.reference,
      p_lat: seal.lat,
      p_lng: seal.lng,
      p_location_confirmed_at: seal.confirmedAt,
      p_location_accuracy_m: seal.accuracyM,
      p_make_default: body.isDefault ?? null,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(NOT_FOUND, 'not_found')
      throw new Error(error.message)
    }

    const { data: row, error: afterErr } = await asUser
      .from('customer_addresses')
      .select(ADDRESS_COLUMNS)
      .eq('id', id)
      .single()
    if (afterErr) throw new Error(afterErr.message)
    return ok(toAddressDto(row as AddressRow), { headers: privateHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/**
 * DELETE /customer/addresses/{id}: borra una dirección PROPIA. 204 sin cuerpo.
 *
 * `customer_address_delete` devuelve `false` si no hay fila suya: ahí es 404.
 * (Un DELETE de PostgREST sin permiso devuelve 204 aunque no borre nada; por eso
 * la función dice cuántas filas tocó.)
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token } = await requireRole(req, 'customer')
    const id = UuidSchema.parse((await params).id)
    const asUser = createUserClient(token)
    const rpc = asUser.rpc.bind(asUser) as unknown as LooseRpc
    const { data: deleted, error } = await rpc('customer_address_delete', { p_id: id })
    if (error) throw new Error(error.message)
    if (deleted !== true) throw new DomainError(NOT_FOUND, 'not_found')
    return new Response(null, { status: 204, headers: privateHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
