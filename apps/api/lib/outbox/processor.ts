import { sendOrderAppealCreated, sendOrderProofRejectedFinal } from '../inngest/client'
import { createServiceClient } from '../supabase/service'

export interface OutboxClaimedRow {
  out_id: string
  out_event_id: string
  out_event_type: string
  out_payload: any
  out_attempts: number
}

/**
 * Procesador de reconciliación para reclamar y despachar atómicamente eventos de `outbox_events` usando `claim_outbox_events` (FOR UPDATE SKIP LOCKED).
 */
export async function processPendingOutboxEvents(): Promise<number> {
  const svc = createServiceClient()

  // 1. Reclamar filas de outbox_events de forma atómica y segura contra concurrencia
  const { data, error } = await svc.rpc('claim_outbox_events', {
    p_limit: 20,
  } as any)

  if (error || !data) {
    if (error) console.error('Error al reclamar eventos de outbox_events:', error.message)
    return 0
  }

  const claimedEvents = data as unknown as OutboxClaimedRow[]
  if (!Array.isArray(claimedEvents) || claimedEvents.length === 0) {
    return 0
  }

  let processedCount = 0
  for (const eventRow of claimedEvents) {
    try {
      if (eventRow.out_event_type === 'order/proof-rejected-final') {
        await sendOrderProofRejectedFinal(eventRow.out_payload)
      } else if (eventRow.out_event_type === 'order/appeal.created') {
        await sendOrderAppealCreated(eventRow.out_payload)
      }

      // 2. Marcar como delivered tras confirmación de Inngest
      await svc
        .from('outbox_events')
        .update({ status: 'delivered', processed_at: new Date().toISOString() } as any)
        .eq('id', eventRow.out_id)

      processedCount++
    } catch (err: any) {
      console.warn(
        `Fallo al despachar evento de outbox ${eventRow.out_id} a Inngest (Intento ${eventRow.out_attempts}). Error:`,
        err?.message,
      )
      await svc
        .from('outbox_events')
        .update({
          status: 'failed',
          last_error: String(err?.message ?? err),
          next_attempt_at: new Date(Date.now() + 2 ** eventRow.out_attempts * 60_000).toISOString(),
        } as any)
        .eq('id', eventRow.out_id)
    }
  }

  return processedCount
}
