import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * La reseña, contra Postgres y sin pasar por la API.
 *
 * Las tres operaciones son self-scoped y ya están gobernadas —dos por RPC con
 * el token del cliente, una por RLS—, así que meterlas por `apps/api` solo
 * añadiría los 470-750 ms de piso que cuesta el salto, sin comprobar nada que
 * la base no compruebe ya.
 */

export interface ReviewTag {
  id: string
  label: string
}

export interface PendingReview {
  orderId: string
  shortId: string
  businessId: string
  businessName: string
  businessLogoUrl: string | null
  deliveredAt: string
  closesAt: string
  /** Viaja con el pendiente porque `app_settings` está cerrada a RLS (0216). */
  tags: ReviewTag[]
}

/** El pedido por el que toca preguntar, o `null` si no hay ninguno. */
export async function fetchPendingReview(): Promise<PendingReview | null> {
  const { data, error } = await getSupabaseBrowser().rpc('get_pending_review')
  if (error) throw new Error(error.message)
  if (!data) return null
  return data as unknown as PendingReview
}

export interface SubmitReviewInput {
  orderId: string
  rating: number
  tags: string[]
  comment: string
}

export async function submitReview(input: SubmitReviewInput): Promise<void> {
  const comentario = input.comment.trim()
  const { error } = await getSupabaseBrowser().rpc('create_order_review', {
    p_order_id: input.orderId,
    p_rating: input.rating,
    p_tags: input.tags,
    p_comment: comentario === '' ? undefined : comentario,
  })
  if (error) throw new Error(error.message)
}

/**
 * «Ahora no»: cierra la pregunta, no la ventana.
 *
 * Se escribe directo por RLS —es dato self-scoped— y el `with check` de la
 * policy exige que el pedido sea del propio cliente, así que no hace falta RPC.
 */
export async function dismissReview(orderId: string, customerUserId: string): Promise<void> {
  const { error } = await getSupabaseBrowser()
    .from('order_review_dismissals')
    .insert({ order_id: orderId, customer_user_id: customerUserId })
  if (error) throw new Error(error.message)
}
