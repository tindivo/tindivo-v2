import { CreateReviewRequestSchema, UuidSchema } from '@tindivo/contracts'
import { CreatedReviewSchema } from '@tindivo/contracts/openapi'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { defineHandler } from '../../../http'
import { createReview } from '../infra/review-store'

/** Deja la reseña de un pedido propio, entregado y dentro de la ventana. */
export const createReviewHandler = defineHandler(
  {
    module: 'reviews',
    method: 'POST',
    path: '/api/v1/customer/orders/{id}/review',
    auth: 'user',
    params: z.object({ id: UuidSchema }),
    body: CreateReviewRequestSchema,
    response: CreatedReviewSchema,
  },
  async ({ actor, params, body, deps }) => {
    if (!actor) throw new DomainError('No autenticado', 'unauthorized')
    if (!actor.roles.includes('customer')) throw new DomainError('No autorizado', 'forbidden')
    return createReview(deps.supabase(), actor.userId, {
      orderId: params.id.toLowerCase(),
      rating: body.rating,
      tags: body.tags,
      comment: body.comment ?? null,
    })
  },
)
