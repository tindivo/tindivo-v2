import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({ band: z.enum(['near', 'far']) })

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * El admin corrige la banda (cerca/lejos) de un pedido ya entregado.
 *
 * Solo mueve `delivery_fee_charged` (lo que el negocio le debe a Tindivo) y el
 * cargo `delivery_fee` pendiente en `business_charges`; la comisión es plana
 * desde la 0125 y no depende de la banda. Ver migración 0213.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const { id } = await params
    const body = Schema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service.rpc('admin_correct_delivery_band', {
      p_order_id: id,
      p_admin_user_id: user.id,
      p_new_band: body.band,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'validation_error')
      throw new Error(error.message)
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
