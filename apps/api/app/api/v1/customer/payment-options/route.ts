import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createUserClient } from '@/lib/supabase/user'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * GET /customer/payment-options: ¿contraentrega o prepago obligatorio?
 *
 * LA DECISIÓN ES DE LA BASE (`docs/negocio/antifraude.md`): esta ruta no
 * recalcula nada, solo expone lo que contesta
 * `current_customer_trusted_for_contraentrega()`, que responde por `auth.uid()`
 * y no acepta a quién preguntar (0171). A propósito NO dice la causa (riesgo o
 * falta de historial): sería más información antifraude de la que la web da.
 * Ante un fallo del RPC responde el lado seguro: prepago. Es solo para pintar:
 * `create_customer_order` vuelve a decidir al crear el pedido.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token } = await requireRole(req, 'customer')

    const { data: trusted, error } = await createUserClient(token).rpc(
      'current_customer_trusted_for_contraentrega',
    )
    if (error) console.error('[payment-options] historial de entregas:', error.message)
    const contraentregaAllowed = trusted === true

    return ok(
      {
        contraentregaAllowed,
        prepayRequired: !contraentregaAllowed,
        reason: contraentregaAllowed ? 'trusted' : 'prepay_required',
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
