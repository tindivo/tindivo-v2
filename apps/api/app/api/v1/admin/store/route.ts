import { STORE_STATUSES, type StoreStatus } from '@tindivo/contracts'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { loadProduct, mapProductRow, PRODUCT_SELECT, STORE_GOALS, storeDb } from '@/lib/store/store'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Lista del admin (PRD §6.1): artículos del estado pedido (por defecto
 * disponibles), conteo de cada pestaña, borradores pendientes y el resumen del
 * experimento. Una sola llamada porque la pantalla pinta todo junto y en
 * celular cada ida y vuelta se nota.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const raw = new URL(req.url).searchParams.get('status') ?? 'available'
    const status: StoreStatus = (STORE_STATUSES as readonly string[]).includes(raw)
      ? (raw as StoreStatus)
      : 'available'

    const db = storeDb()
    const [items, statuses, counts, metrics] = await Promise.all([
      db
        .from('store_products')
        .select(PRODUCT_SELECT)
        .eq('status', status)
        .order(status === 'sold' ? 'sold_at' : 'updated_at', { ascending: false }),
      db.from('store_products').select('status,updated_at'),
      db.rpc('store_event_counts'),
      db.rpc('store_metrics'),
    ])
    for (const r of [items, statuses, counts, metrics])
      if (r.error) throw new Error(r.error.message)

    const byProduct = new Map(
      ((counts.data ?? []) as { product_id: string; views: number; whatsapp_clicks: number }[]).map(
        (c) => [c.product_id, c],
      ),
    )
    const tabs: Record<StoreStatus, number> = {
      draft: 0,
      available: 0,
      reserved: 0,
      sold: 0,
      hidden: 0,
    }
    let lastDraftAt: string | null = null
    for (const row of (statuses.data ?? []) as { status: StoreStatus; updated_at: string }[]) {
      tabs[row.status] += 1
      if (row.status === 'draft' && (!lastDraftAt || row.updated_at > lastDraftAt)) {
        lastDraftAt = row.updated_at
      }
    }

    return ok(
      {
        items: ((items.data ?? []) as Record<string, unknown>[]).map((r) => {
          const p = mapProductRow(r)
          const c = byProduct.get(p.id)
          return {
            ...p,
            views: Number(c?.views ?? 0),
            whatsappClicks: Number(c?.whatsapp_clicks ?? 0),
          }
        }),
        counts: tabs,
        drafts: { count: tabs.draft, lastUpdatedAt: lastDraftAt },
        metrics: metrics.data,
        goals: STORE_GOALS,
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/**
 * Crea un borrador vacío. El formulario lo llama al subir la PRIMERA foto
 * (PRD §6.3): hace falta el id para que la foto tenga carpeta en el bucket.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const db = storeDb()
    const { data, error } = await db
      .from('store_products')
      .insert({ seller_id: null })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return ok(await loadProduct(db, data.id as string), { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
