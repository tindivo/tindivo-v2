import type { Database } from '@tindivo/supabase'
import {
  OrderAppealCreatedSchema,
  OrderProofRejectedFinalSchema,
  sendOrderAppealCreated,
  sendOrderProofRejectedFinal,
} from '../inngest/client'
import { createServiceClient } from '../supabase/service'

/**
 * Fila devuelta por `claim_outbox_events`. Se deriva de los tipos generados en
 * vez de declararse a mano: si la RPC cambia de forma, el error sale aquí y no
 * en producción.
 */
export type OutboxClaimedRow =
  Database['public']['Functions']['claim_outbox_events']['Returns'][number]

/**
 * Procesador de reconciliación para reclamar y despachar atómicamente eventos de `outbox_events` usando `claim_outbox_events` (FOR UPDATE SKIP LOCKED).
 */
export async function processPendingOutboxEvents(): Promise<number> {
  const svc = createServiceClient()

  // 1. Reclamar filas de outbox_events de forma atómica y segura contra concurrencia
  const { data, error } = await svc.rpc('claim_outbox_events', {
    p_limit: 20,
  })

  if (error || !data) {
    if (error) console.error('Error al reclamar eventos de outbox_events:', error.message)
    return 0
  }

  const claimedEvents = data
  if (!Array.isArray(claimedEvents) || claimedEvents.length === 0) {
    return 0
  }

  let processedCount = 0
  for (const eventRow of claimedEvents) {
    try {
      // `out_payload` llega como Json: se valida contra el mismo esquema que usa
      // el emisor antes de despachar. Un payload corrupto cae al catch de abajo
      // y queda en `failed` con el motivo, en vez de viajar a Inngest.
      if (eventRow.out_event_type === 'order/proof-rejected-final') {
        await sendOrderProofRejectedFinal(OrderProofRejectedFinalSchema.parse(eventRow.out_payload))
      } else if (eventRow.out_event_type === 'order/appeal.created') {
        await sendOrderAppealCreated(OrderAppealCreatedSchema.parse(eventRow.out_payload))
      }

      // 2. Marcar como delivered tras confirmación de Inngest
      await svc
        .from('outbox_events')
        .update({ status: 'delivered', processed_at: new Date().toISOString() })
        .eq('id', eventRow.out_id)

      processedCount++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        `Fallo al despachar evento de outbox ${eventRow.out_id} a Inngest (Intento ${eventRow.out_attempts}). Error:`,
        message,
      )
      await svc
        .from('outbox_events')
        .update({
          status: 'failed',
          last_error: message,
          next_attempt_at: new Date(Date.now() + 2 ** eventRow.out_attempts * 60_000).toISOString(),
        })
        .eq('id', eventRow.out_id)
    }
  }

  return processedCount
}
