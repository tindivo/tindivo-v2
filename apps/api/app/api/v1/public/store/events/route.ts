import { storeEventSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { storeDb } from '@/lib/store/store'

export const dynamic = 'force-dynamic'

/** Tope por sesión y minuto: un beacon legítimo manda un puñado, no cientos. */
const MAX_PER_SESSION_PER_MINUTE = 60

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Registra un evento del embudo (PRD §9). Público y anónimo: `session_id` lo
 * inventa el navegador. Se responde 204 siempre que se guarde, porque el
 * cliente lo manda con `sendBeacon` y no lee la respuesta.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const body = storeEventSchema.parse(await req.json())
    const db = storeDb()

    const since = new Date(Date.now() - 60_000).toISOString()
    const { count, error: countError } = await db
      .from('store_events')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', body.sessionId)
      .gte('created_at', since)
    if (countError) throw new Error(countError.message)
    if ((count ?? 0) >= MAX_PER_SESSION_PER_MINUTE) {
      throw new DomainError('Demasiados eventos', 'rate_limited')
    }

    const row = {
      type: body.type,
      product_id: body.productId,
      search_term: body.searchTerm,
      ref: body.ref,
      session_id: body.sessionId,
      metadata: body.metadata,
    }
    let { error } = await db.from('store_events').insert(row)
    // Un id de artículo que ya no existe (borrado) no debe perder el evento.
    if (error?.code === '23503') {
      ;({ error } = await db.from('store_events').insert({ ...row, product_id: null }))
    }
    if (error) throw new Error(error.message)
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
