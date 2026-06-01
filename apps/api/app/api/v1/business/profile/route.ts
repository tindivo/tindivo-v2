import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  yapeNumber: z.string().trim().max(20).optional(),
  plinNumber: z.string().trim().max(20).optional(),
  tagline: z.string().trim().max(120).optional(),
  accentColor: z
    .string()
    .regex(/^[0-9a-f]{6}$/)
    .optional(),
  estimatedEtaMin: z.number().int().min(1).max(180).optional(),
  estimatedEtaMax: z.number().int().min(1).max(180).optional(),
  deliveryFee: z.number().nonnegative().max(50).optional(),
  publishesCatalog: z.boolean().optional(),
  acceptsWebPickup: z.boolean().optional(),
  acceptsWebDelivery: z.boolean().optional(),
  usesTindivoDrivers: z.boolean().optional(),
  categoria: z.array(z.string().trim().max(40)).max(2).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El negocio edita su perfil/capacidades. La consistencia de capacidades la
 *  garantiza el CHECK `capabilities_consistent` en la BD. */
export async function PATCH(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const body = Schema.parse(await req.json())
    const patch = {
      updated_at: new Date().toISOString(),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.yapeNumber !== undefined && { yape_number: body.yapeNumber }),
      ...(body.plinNumber !== undefined && { plin_number: body.plinNumber }),
      ...(body.tagline !== undefined && { tagline: body.tagline }),
      ...(body.accentColor !== undefined && { accent_color: body.accentColor }),
      ...(body.estimatedEtaMin !== undefined && { estimated_eta_min: body.estimatedEtaMin }),
      ...(body.estimatedEtaMax !== undefined && { estimated_eta_max: body.estimatedEtaMax }),
      ...(body.deliveryFee !== undefined && { delivery_fee: body.deliveryFee }),
      ...(body.publishesCatalog !== undefined && { publishes_catalog: body.publishesCatalog }),
      ...(body.acceptsWebPickup !== undefined && { accepts_web_pickup: body.acceptsWebPickup }),
      ...(body.acceptsWebDelivery !== undefined && {
        accepts_web_delivery: body.acceptsWebDelivery,
      }),
      ...(body.usesTindivoDrivers !== undefined && {
        uses_tindivo_drivers: body.usesTindivoDrivers,
      }),
      ...(body.categoria !== undefined && { categoria: body.categoria }),
    }
    const service = createServiceClient()
    const { data, error } = await service
      .from('businesses')
      .update(patch)
      .eq('user_id', user.id)
      .select(
        'id,name,primary_capability,publishes_catalog,accepts_web_pickup,accepts_web_delivery,uses_tindivo_drivers',
      )
      .maybeSingle()
    if (error) {
      // 23514 = violación del CHECK de capacidades consistentes.
      if (error.code === '23514')
        throw new DomainError('Combinación de capacidades inválida', 'validation_error')
      throw new Error(error.message)
    }
    if (!data) throw new DomainError('Negocio no encontrado', 'not_found')
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
