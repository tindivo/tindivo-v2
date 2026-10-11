import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'
import { createUserClient } from '@/lib/supabase/user'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * GET /customer/payment-options: ¿contraentrega o prepago obligatorio?
 *
 * LA DECISIÓN ES DE LA BASE (`docs/negocio/antifraude.md`): esta ruta no
 * recalcula nada, solo expone lo que ya contestan
 *  · `current_customer_trusted_for_contraentrega()`, que responde por
 *    `auth.uid()` y no acepta a quién preguntar (0171), y
 *  · `customer_requires_prepayment(user, teléfono verificado, null)`, que solo
 *    sirve para distinguir el motivo (riesgo vs. cliente nuevo).
 * Ante un fallo de la RPC responde el lado seguro: prepago. Es solo para
 * pintar: `create_customer_order` vuelve a decidir al crear el pedido.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token, user } = await requireRole(req, 'customer')
    const client = createUserClient(token)

    const { data: trusted, error: trustedError } = await client.rpc(
      'current_customer_trusted_for_contraentrega',
    )
    if (trustedError)
      console.error('[payment-options] historial de entregas:', trustedError.message)
    const contraentregaAllowed = trusted === true

    let reason: 'trusted' | 'no_history' | 'risk_blocked' = contraentregaAllowed
      ? 'trusted'
      : 'no_history'
    if (!contraentregaAllowed) {
      const { data: profile } = await client
        .from('customer_profiles')
        .select('phone,phone_verified_at')
        .eq('user_id', user.id)
        .maybeSingle()
      const digits = profile?.phone_verified_at ? (profile.phone ?? '').replace(/\D/g, '') : ''
      const { data: risky } = await createServiceClient().rpc('customer_requires_prepayment', {
        p_user_id: user.id,
        p_phone: digits ? digits.slice(-9) : (null as unknown as string),
        p_reference: null as unknown as string,
      })
      if (risky === true) reason = 'risk_blocked'
    }

    return ok(
      { contraentregaAllowed, prepayRequired: !contraentregaAllowed, reason },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
