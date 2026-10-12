import { DomainError } from '@tindivo/core'
import { parseDeletionResult } from '@/lib/customer/account-deletion'
import { requireRole } from '@/lib/http/auth'
import { handleOptions } from '@/lib/http/cors'
import { privateHeaders } from '@/lib/http/private-response'
import { handleError } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

type LooseRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>

/**
 * DELETE /customer/account: borra la cuenta de la sesión (Apple 5.1.1(v), Google
 * «Account deletion»). La usan las apps nativas y la página web `/borrar-cuenta`.
 *
 * No recibe ningún id: borra la cuenta del token, y solo esa. Lo hace
 * `delete_customer_account` (0259) en una transacción: anonimiza los pedidos,
 * borra lo personal y la identidad. 204 sin cuerpo si se borró; 409 con el motivo
 * en español si hay un pedido en curso, dinero sin resolver o un rol que no es de
 * cliente. Repetirla con el mismo token da 401 (la identidad ya no existe: es la
 * forma de saber que ya está borrada; la autenticación no se debilita por eso).
 *
 * Lo que se conserva y por qué: `Docs/trabajo/movil/07-publicacion-tiendas.md` §8.
 */
export async function DELETE(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'customer')
    const service = createServiceClient()
    const rpc = service.rpc.bind(service) as unknown as LooseRpc
    const { data, error } = await rpc('delete_customer_account', { p_user_id: user.id })
    if (error) throw new Error(error.message)

    const outcome = parseDeletionResult(data)
    if (outcome.kind === 'blocked') throw new DomainError(outcome.detail, 'conflict')
    return new Response(null, { status: 204, headers: privateHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
