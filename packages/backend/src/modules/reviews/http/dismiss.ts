import { UuidSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { defineHandler } from '../../../http'
import { dismissReview } from '../infra/review-store'

/** Apaga la pregunta «¿cómo estuvo?» de un pedido propio. Repetirlo no falla. */
export const dismissReviewHandler = defineHandler(
  {
    module: 'reviews',
    method: 'POST',
    path: '/api/v1/customer/orders/{id}/review/dismiss',
    auth: 'user',
    params: z.object({ id: UuidSchema }),
    response: 'empty',
  },
  async ({ actor, params, deps }) => {
    if (!actor) throw new DomainError('No autenticado', 'unauthorized')
    if (!actor.roles.includes('customer')) throw new DomainError('No autorizado', 'forbidden')
    await dismissReview(deps.supabase(), actor.userId, params.id.toLowerCase())
    return undefined
  },
)
