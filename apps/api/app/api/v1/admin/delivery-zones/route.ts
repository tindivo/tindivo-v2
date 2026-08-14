import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * Zonas que cambian la banda de envío dentro de la cobertura (0161).
 *
 * El anillo es el MISMO formato que `app_settings.coverage_polygon`:
 * `[{lat,lng}, …]` abierto. Así el editor del panel, el `pointInPolygon` de
 * TypeScript del cliente y el `point_in_ring` de la base hablan igual.
 */
const Ring = z
  .array(
    z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }),
  )
  .min(3)
  .max(200)

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  polygon: Ring,
  // Hoy solo se dibuja 'far'. 'exclusion' existe en el CHECK de la tabla pero
  // todavía no tiene lector, así que no se acepta por aquí.
  kind: z.literal('far').default('far'),
})

const UpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    polygon: Ring.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' })

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Todas las zonas, activas o no: el panel las gestiona, no solo las usa. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const service = createServiceClient()
    const { data, error } = await service
      .from('delivery_zones')
      .select('id,kind,name,polygon,active,created_at,updated_at')
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return ok(data ?? [], { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const body = CreateSchema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service
      .from('delivery_zones')
      .insert({
        kind: body.kind,
        name: body.name,
        polygon: body.polygon,
        updated_by: user.id,
      })
      .select('id,kind,name,polygon,active,created_at,updated_at')
      .single()
    if (error) throw new Error(error.message)
    return ok(data, { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

export async function PATCH(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const id = new URL(req.url).searchParams.get('id')
    if (!id) throw new DomainError('Falta el id de la zona', 'validation_error')
    const body = UpdateSchema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service
      .from('delivery_zones')
      .update({ ...body, updated_by: user.id })
      .eq('id', id)
      .select('id,kind,name,polygon,active,created_at,updated_at')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new DomainError('Zona no encontrada', 'not_found')
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/**
 * Borrado de verdad, no lógico.
 *
 * `active` ya cubre el "quítala del cobro sin perderla", que es lo que se usa
 * para desactivar una zona una temporada. Un borrado lógico ADEMÁS del flag
 * daría dos formas de que una zona no cuente y una pantalla que tiene que
 * explicar la diferencia.
 */
export async function DELETE(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const id = new URL(req.url).searchParams.get('id')
    if (!id) throw new DomainError('Falta el id de la zona', 'validation_error')
    const service = createServiceClient()
    const { error } = await service.from('delivery_zones').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return ok({ deleted: true }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
