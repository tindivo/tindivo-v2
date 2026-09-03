import { MapLandmarkCategorySchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * Landmarks de referencia (0208): boticas, colegios, mercado, iglesias… que el
 * admin cura a mano para orientar al cliente en el mapa de ubicación.
 *
 * La caja de coordenadas la exige el CHECK `map_landmarks_in_town` de la tabla
 * (misma caja que `address_directory`, 0122); aquí se valida el rango amplio de
 * lat/lng para dar un error legible antes del round-trip, pero el CHECK de la
 * base es la fuente de verdad.
 */
const LandmarkFields = {
  name: z.string().trim().min(2).max(80),
  category: MapLandmarkCategorySchema,
  lat: z.number().min(-9.2).max(-9.1),
  lng: z.number().min(-78.33).max(-78.23),
}

const CreateSchema = z.object(LandmarkFields)

const UpdateSchema = z
  .object({ ...LandmarkFields, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' })

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Todos los landmarks, activos o no: el panel los gestiona, no solo los usa. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const service = createServiceClient()
    const { data, error } = await service
      .from('map_landmarks')
      .select('id,name,category,lat,lng,active,created_at,updated_at')
      .order('category', { ascending: true })
      .order('name', { ascending: true })
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
      .from('map_landmarks')
      .insert({ ...body, updated_by: user.id })
      .select('id,name,category,lat,lng,active,created_at,updated_at')
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
    if (!id) throw new DomainError('Falta el id del landmark', 'validation_error')
    const body = UpdateSchema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service
      .from('map_landmarks')
      .update({ ...body, updated_by: user.id })
      .eq('id', id)
      .select('id,name,category,lat,lng,active,created_at,updated_at')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new DomainError('Landmark no encontrado', 'not_found')
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/**
 * Borrado de verdad, no lógico. `active` ya cubre "quítalo del mapa sin
 * perderlo"; un borrado lógico además del flag daría dos formas de que un
 * landmark no cuente.
 */
export async function DELETE(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const id = new URL(req.url).searchParams.get('id')
    if (!id) throw new DomainError('Falta el id del landmark', 'validation_error')
    const service = createServiceClient()
    const { error } = await service.from('map_landmarks').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return ok({ deleted: true }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
