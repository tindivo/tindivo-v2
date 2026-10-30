import { UpdateCustomerProfileRequestSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
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

/** PUT /customer/profile: la sesión decide el dueño; solo se recibe el nombre. */
export async function PUT(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'customer')
    const { fullName } = UpdateCustomerProfileRequestSchema.parse(await req.json())
    const { error } = await createServiceClient()
      .from('customer_profiles')
      .upsert({ user_id: user.id, full_name: fullName }, { onConflict: 'user_id' })
    // Como las demás escrituras de cliente, el trigger de cuenta borrada
    // rechaza la operación y el manejador común devuelve el problema existente.
    if (error) throw new Error(error.message)
    return GET(req)
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/**
 * GET /customer/profile: el perfil del cliente de la sesión.
 *
 * Lo que la web sacaba con un `SELECT` de `customer_profiles` en el checkout.
 * Se lee con la sesión del usuario (la RLS limita la fila a la suya) y NO
 * recibe ningún id: no hay forma de pedir el perfil de otro.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token, user } = await requireRole(req, 'customer')

    const { data, error } = await createUserClient(token)
      .from('customer_profiles')
      .select('full_name,phone,phone_verified_at,contraentrega_blocked,blocked_until')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new DomainError('customer_profile_not_found', 'not_found')

    const blocked = data.blocked_until !== null && new Date(data.blocked_until) > new Date()
    return ok(
      {
        fullName: data.full_name,
        phone: data.phone,
        phoneVerified: data.phone_verified_at !== null,
        phoneVerifiedAt: data.phone_verified_at,
        contraentregaBlocked: data.contraentrega_blocked,
        blockedUntil: data.blocked_until,
        blocked,
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
