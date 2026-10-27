import { CustomerPendingReviewSchema } from '@tindivo/contracts/openapi'
import { DomainError } from '@tindivo/core'
import { defineHandler } from '../../../http'
import { loadPendingReview } from '../infra/review-store'

/** El pedido por el que preguntar «¿cómo estuvo?», o `null`. Solo lectura. */
export const pendingReviewHandler = defineHandler(
  {
    module: 'reviews',
    method: 'GET',
    path: '/api/v1/customer/reviews/pending',
    auth: 'user',
    response: CustomerPendingReviewSchema.nullable(),
  },
  async ({ actor, deps }) => {
    if (!actor) throw new DomainError('No autenticado', 'unauthorized')
    if (!actor.roles.includes('customer')) throw new DomainError('No autorizado', 'forbidden')
    return loadPendingReview(deps.supabase(), actor.userId)
  },
)
