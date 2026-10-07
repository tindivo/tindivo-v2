import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { loadProduct, storeDb } from '@/lib/store/store'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Duplica los CAMPOS, no las fotos (PRD §6.2): nace un borrador nuevo con su
 * propio código y, al publicarse, su propio slug. Sirve para «dos iguales»: cada
 * publicación es una pieza única, así que no hay stock.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const id = z.uuid().parse((await params).id)
    const db = storeDb()
    const src = await loadProduct(db, id)
    const { data, error } = await db
      .from('store_products')
      .insert({
        title: src.title,
        description: src.description,
        category_id: src.categoryId,
        audience: src.audience,
        condition: src.condition,
        condition_score: src.conditionScore,
        size_label: src.sizeLabel,
        price: src.price,
        original_price: src.originalPrice,
        is_clearance: src.isClearance,
        negotiable: src.negotiable,
        cover_focus_x: src.coverFocusX,
        cover_focus_y: src.coverFocusY,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return ok(await loadProduct(db, data.id as string), { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
