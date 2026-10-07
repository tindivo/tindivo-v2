import { DomainError } from '@tindivo/core'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import {
  mapCardJson,
  mapProductRow,
  PRODUCT_SELECT,
  readStoreSettings,
  storeDb,
} from '@/lib/store/store'

export const dynamic = 'force-dynamic'

const RELATED_MAX = 4
const RELATED_MIN = 2

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Detalle público por slug. Solo disponible, reservado y vendido: un borrador o
 * un oculto responde 404 igual que un slug inexistente, para no revelar que
 * existe. Los relacionados son 2–4 disponibles de la misma categoría; si esa
 * categoría no alcanza, se completa con otros disponibles (PRD §5.3).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { slug } = await params
    const db = storeDb()
    const { data, error } = await db
      .from('store_products')
      .select(PRODUCT_SELECT)
      .eq('slug', slug)
      .in('status', ['available', 'reserved', 'sold'])
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new DomainError('Artículo no encontrado', 'not_found')

    const product = mapProductRow(data as Record<string, unknown>)
    const [sameCategory, everything, settings] = await Promise.all([
      db.rpc('list_store_products', { p_category: product.categorySlug }),
      db.rpc('list_store_products', {}),
      readStoreSettings(db),
    ])
    if (sameCategory.error) throw new Error(sameCategory.error.message)
    if (everything.error) throw new Error(everything.error.message)

    const pick = (rows: unknown, skip: Set<string>) =>
      ((rows ?? []) as Record<string, unknown>[])
        .map(mapCardJson)
        .filter((c) => c.status === 'available' && !skip.has(c.id))
    const skip = new Set([product.id])
    let related = pick(sameCategory.data, skip).slice(0, RELATED_MAX)
    if (related.length < RELATED_MIN) {
      for (const c of related) skip.add(c.id)
      related = [...related, ...pick(everything.data, skip)].slice(0, RELATED_MAX)
    }

    // Lo interno del admin no se filtra al público.
    const {
      views: _views,
      whatsappClicks: _clicks,
      updatedAt: _updatedAt,
      publishedAt: _publishedAt,
      categoryId: _categoryId,
      ...pub
    } = product
    return ok(
      { product: pub, related, settings },
      {
        headers: {
          ...corsHeaders(req),
          'cache-control': 'public, s-maxage=15, stale-while-revalidate=60',
        },
      },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
