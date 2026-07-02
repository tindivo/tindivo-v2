import { z } from 'zod'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// .trim() transforma ANTES de .min(2): "  a  " → 422 (ZodError vía handleError).
const QuerySchema = z.object({ q: z.string().trim().min(2).max(60) })

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Búsqueda pública de negocios y platos, insensible a mayúsculas y tildes
 * (la normalización vive en el RPC search_catalog: unaccent + lower en ambos
 * lados, índices GIN trigram). Público, sin auth.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { q } = QuerySchema.parse({ q: new URL(req.url).searchParams.get('q') ?? '' })
    const service = createServiceClient()
    const { data, error } = await service.rpc('search_catalog', { p_query: q, p_limit: 20 })
    if (error) throw new Error(error.message)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
