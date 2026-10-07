import { parseStoreListParams } from '@tindivo/contracts'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { mapCardJson, readStoreSettings, storeDb } from '@/lib/store/store'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Listado público de Tindivo Store: grilla (disponibles y reservados), «Vendidos
 * recientemente» (máx. 6), categorías con su cantidad y los ajustes públicos.
 *
 * Los parámetros son los MISMOS de la URL del comprador (`q`, `categoria`,
 * `condicion`, `orden`) para que el customer los reenvíe tal cual. Borradores y
 * ocultos nunca salen: la RPC solo mira estados públicos.
 *
 * Las cantidades de las categorías se calculan sobre el catálogo SIN filtrar:
 * el chip dice cuántos artículos tiene la categoría, no cuántos coinciden con
 * la búsqueda de turno.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const sp = new URL(req.url).searchParams
    const filters = parseStoreListParams({
      q: sp.get('q') ?? undefined,
      categoria: sp.get('categoria') ?? undefined,
      condicion: sp.get('condicion') ?? undefined,
      orden: sp.get('orden') ?? undefined,
    })
    const db = storeDb()
    const [listed, everything, sold, categories, settings] = await Promise.all([
      db.rpc('list_store_products', {
        p_query: filters.q,
        p_category: filters.category,
        p_condition: filters.condition,
        p_order: filters.order,
      }),
      db.rpc('list_store_products', {}),
      db.rpc('list_store_sold', { p_limit: 6 }),
      db.from('store_categories').select('slug,name,icon').eq('active', true).order('sort_order'),
      readStoreSettings(db),
    ])
    for (const r of [listed, everything, sold, categories]) {
      if (r.error) throw new Error(r.error.message)
    }

    const all = (everything.data ?? []) as { category_slug: string }[]
    const counts = new Map<string, number>()
    for (const p of all) counts.set(p.category_slug, (counts.get(p.category_slug) ?? 0) + 1)

    return ok(
      {
        products: ((listed.data ?? []) as Record<string, unknown>[]).map(mapCardJson),
        sold: ((sold.data ?? []) as Record<string, unknown>[]).map(mapCardJson),
        // Una categoría sin artículos públicos no se muestra (PRD §5).
        categories: ((categories.data ?? []) as { slug: string; name: string; icon: string }[])
          .map((c) => ({ ...c, count: counts.get(c.slug) ?? 0 }))
          .filter((c) => c.count > 0),
        totalAvailable: all.length,
        settings,
      },
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
