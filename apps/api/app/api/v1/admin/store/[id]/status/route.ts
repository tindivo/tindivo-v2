import {
  canTransitionStoreStatus,
  missingForPublish,
  type StoreDraftFields,
  storeStatusChangeSchema,
} from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { loadProduct, storeDb, throwDbError } from '@/lib/store/store'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Cambia el estado de un artículo: publicar, reservar, vender, ocultar o volver
 * a disponible. Devuelve el artículo nuevo y el estado ANTERIOR: con eso el
 * admin arma el «Deshacer» de 5 segundos (PRD §6.2) sin ventanas de confirmación.
 * Deshacer es simplemente otro cambio de estado hacia el anterior; el trigger
 * limpia `sold_at` solo.
 *
 * El cliente nunca decide si algo es publicable: se valida aquí y, de nuevo, en
 * la base (constraint + triggers de la 0242).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const id = z.uuid().parse((await params).id)
    const { status: next } = storeStatusChangeSchema.parse(await req.json())
    const db = storeDb()
    const current = await loadProduct(db, id)

    if (!canTransitionStoreStatus(current.status, next)) {
      throw new DomainError(
        `No se puede pasar de «${current.status}» a «${next}»`,
        'invalid_state_transition',
      )
    }
    if (current.status === 'draft') {
      const draft: StoreDraftFields = {
        code: current.code,
        slug: current.slug,
        title: current.title,
        price: current.price,
        originalPrice: current.originalPrice,
        isClearance: current.isClearance,
        condition: current.condition,
        conditionScore: current.conditionScore,
        sizeLabel: current.sizeLabel,
        status: current.status,
        categoryId: current.categoryId,
      }
      const missing = missingForPublish(draft, current.images.length)
      if (missing) throw new DomainError(missing, 'validation_error')
    }

    const { error } = await db.from('store_products').update({ status: next }).eq('id', id)
    if (error) throwDbError(error)

    return ok(
      {
        product: await loadProduct(db, id),
        previous: { status: current.status, soldAt: current.soldAt },
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
