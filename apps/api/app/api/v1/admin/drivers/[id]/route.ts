import { VehicleTypeSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().min(1).max(30).optional(),
  vehicleType: VehicleTypeSchema.optional(),
  isActive: z.boolean().optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Edita / desactiva un motorizado (admin). Desactivar = no recibe pedidos. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const { id } = await params
    const body = Schema.parse(await req.json())
    const patch: {
      full_name?: string
      phone?: string
      vehicle_type?: z.infer<typeof VehicleTypeSchema>
      is_active?: boolean
    } = {}
    if (body.fullName !== undefined) patch.full_name = body.fullName
    if (body.phone !== undefined) patch.phone = body.phone
    if (body.vehicleType !== undefined) patch.vehicle_type = body.vehicleType
    if (body.isActive !== undefined) patch.is_active = body.isActive

    const service = createServiceClient()
    const { data, error } = await service
      .from('drivers')
      .update(patch)
      .eq('id', id)
      .select('id,full_name,is_active')
      .single()
    if (error) throw new DomainError(error.message, 'not_found')
    // Si se desactiva, cierra su disponibilidad.
    if (body.isActive === false) {
      await service.from('driver_availability').update({ is_available: false }).eq('driver_id', id)
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
