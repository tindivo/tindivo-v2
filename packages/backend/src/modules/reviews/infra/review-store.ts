import type { CreatedReviewSchema, CustomerPendingReviewSchema } from '@tindivo/contracts/openapi'
import { DomainError } from '@tindivo/core'
import type { TypedSupabaseClient } from '@tindivo/supabase'
import type { z } from 'zod'

type PendingReview = z.infer<typeof CustomerPendingReviewSchema>
type CreatedReview = z.infer<typeof CreatedReviewSchema>

interface DbError {
  code?: string
  message: string
}

/** Postgres devuelve `timestamptz` con offset; la API manda siempre UTC con `Z` (API-8). */
const toUtcIso = (value: string): string => new Date(value).toISOString()

/**
 * Los códigos de la 0280 (DB-16) como errores de la API. Un pedido ajeno y uno inexistente
 * llegan igual (`order_not_found`) y salen igual: un 404 que no confirma que exista. Los
 * mensajes son los que la web ya muestra (0215).
 */
function toDomainError(error: DbError, action: string): Error {
  if (error.code === 'P0002' && error.message === 'order_not_found') {
    return new DomainError('Ese pedido no existe', 'not_found')
  }
  if (error.code === 'P0001') {
    switch (error.message) {
      case 'order_not_delivered':
        return new DomainError('Solo se puede calificar un pedido entregado', 'conflict')
      case 'review_window_closed':
        return new DomainError('El plazo para calificar este pedido ya venció', 'conflict')
      case 'order_already_reviewed':
        return new DomainError('Este pedido ya fue calificado', 'conflict')
      case 'invalid_rating':
        return new DomainError('La nota debe estar entre 1 y 5', 'validation_error')
      // El trigger de la 0259 rechaza cualquier escritura de una cuenta borrada.
      case 'cannot write because the account was deleted':
        return new DomainError('Esta cuenta fue eliminada', 'unauthorized')
    }
  }
  return new Error(`No se pudo ${action}: ${error.message}`)
}

interface PendingRow {
  orderId: string
  shortId: string
  businessId: string
  businessName: string
  businessLogoUrl: string | null
  deliveredAt: string
  closesAt: string
  tags: { id: string; label: string }[]
}

/** El pendiente del cliente (`review_pending_for`), o `null` si no hay nada que preguntar. */
export async function loadPendingReview(
  db: TypedSupabaseClient,
  actorUserId: string,
): Promise<PendingReview | null> {
  const { data, error } = await db.rpc('review_pending_for', { p_actor_user_id: actorUserId })
  if (error) throw toDomainError(error, 'leer la reseña pendiente')
  if (data === null) return null
  const row = data as unknown as PendingRow
  return {
    orderId: row.orderId,
    shortId: row.shortId,
    businessId: row.businessId,
    businessName: row.businessName,
    businessLogoUrl: row.businessLogoUrl,
    deliveredAt: toUtcIso(row.deliveredAt),
    closesAt: toUtcIso(row.closesAt),
    tags: row.tags.map((t) => ({ id: t.id, label: t.label })),
  }
}

export interface ReviewInput {
  orderId: string
  rating: number
  tags: string[]
  comment: string | null
}

/** Deja la reseña (`create_order_review_for`): una por pedido, propio, entregado y en plazo. */
export async function createReview(
  db: TypedSupabaseClient,
  actorUserId: string,
  input: ReviewInput,
): Promise<CreatedReview> {
  const { data, error } = await db.rpc('create_order_review_for', {
    p_actor_user_id: actorUserId,
    p_order_id: input.orderId,
    p_rating: input.rating,
    p_tags: input.tags,
    ...(input.comment === null ? {} : { p_comment: input.comment }),
  })
  if (error) throw toDomainError(error, 'guardar la reseña')
  const row = data as unknown as CreatedReview
  return { id: row.id, orderId: row.orderId, rating: row.rating }
}

/** Descarta la pregunta (`dismiss_order_review_for`). Repetirlo no falla. */
export async function dismissReview(
  db: TypedSupabaseClient,
  actorUserId: string,
  orderId: string,
): Promise<void> {
  const { error } = await db.rpc('dismiss_order_review_for', {
    p_actor_user_id: actorUserId,
    p_order_id: orderId,
  })
  if (error) throw toDomainError(error, 'descartar la reseña')
}
