import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { storeDb } from '@/lib/store/store'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Las categorías fijas de la tienda, con el id que necesita el formulario. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const { data, error } = await storeDb()
      .from('store_categories')
      .select('id,name,slug,icon,sort_order')
      .eq('active', true)
      .order('sort_order')
    if (error) throw new Error(error.message)
    return ok(
      (data ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon })),
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
