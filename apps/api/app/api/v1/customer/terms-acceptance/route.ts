import { TermsAcceptanceRequestSchema } from '@tindivo/contracts'
import { requireRole } from '@/lib/http/auth'
import { handleOptions } from '@/lib/http/cors'
import { privateHeaders } from '@/lib/http/private-response'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createUserClient } from '@/lib/supabase/user'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * POST /customer/terms-acceptance: registra que la persona aceptó los términos y
 * la privacidad (Ley 29733) en una versión.
 *
 * Lo que la web hacía con un INSERT directo. Se escribe con la sesión del
 * cliente (la policy `ta_self_all` solo deja escribir filas con SU user_id) y la
 * ruta no recibe ningún id de usuario. Es idempotente por versión
 * (`unique (user_id, version)`): repetirla no crea otra fila ni cambia la fecha;
 * responde 200 con la original en vez de un error.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token, user } = await requireRole(req, 'customer')
    const { version } = TermsAcceptanceRequestSchema.parse(await req.json())
    const asUser = createUserClient(token)

    const { data: inserted, error } = await asUser
      .from('terms_acceptance')
      .insert({ user_id: user.id, version })
      .select('version,accepted_at')
      .single()
    if (!error && inserted) {
      return ok(
        { version: inserted.version, acceptedAt: inserted.accepted_at, alreadyAccepted: false },
        { status: 201, headers: privateHeaders(req) },
      )
    }
    // 23505 = ya la había aceptado: se devuelve la fecha original.
    if (error?.code !== '23505') throw new Error(error?.message ?? 'sin fila')

    const { data: existing, error: readErr } = await asUser
      .from('terms_acceptance')
      .select('version,accepted_at')
      .eq('user_id', user.id)
      .eq('version', version)
      .single()
    if (readErr) throw new Error(readErr.message)
    return ok(
      { version: existing.version, acceptedAt: existing.accepted_at, alreadyAccepted: true },
      { headers: privateHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
