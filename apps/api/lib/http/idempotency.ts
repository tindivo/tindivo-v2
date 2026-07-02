import { DomainError } from '@tindivo/core'
import type { TypedSupabaseClient } from '@tindivo/supabase'

export interface IdempotentResult {
  status: number
  body: unknown
  replayed: boolean
}

/**
 * Replay temprano: devuelve la respuesta cacheada si esta clave ya COMPLETÓ con
 * el mismo payload; null en cualquier otro caso. Úsalo ANTES de guards que
 * dependen del estado actual (pausa/capacidades/horario): un retry de una
 * request ya ejecutada debe devolver la respuesta original aunque el estado
 * del negocio haya cambiado entre medio (contrato estilo Stripe). Los casos
 * hash-distinto / en-vuelo se dejan a withIdempotency, que ya los rechaza.
 */
export async function findCompletedReplay(
  supabase: TypedSupabaseClient,
  args: { key: string; scope: string; requestHash: string },
): Promise<{ status: number; body: unknown } | null> {
  const { data } = await supabase
    .from('idempotency_keys')
    .select('status,request_hash,response_status,response_body')
    .eq('key', args.key)
    .eq('scope', args.scope)
    .maybeSingle()
  if (data?.status !== 'completed' || data.request_hash !== args.requestHash) return null
  return { status: data.response_status ?? 200, body: data.response_body }
}

/**
 * Idempotencia estilo Stripe. Reclama la clave con un INSERT atómico
 * (ON CONFLICT DO NOTHING vía upsert ignoreDuplicates). Si la reclama, ejecuta
 * la operación y guarda la respuesta. Si ya existía: reproduce la respuesta
 * almacenada, o rechaza si el payload difiere / sigue en vuelo.
 */
export async function withIdempotency(
  supabase: TypedSupabaseClient,
  args: { key: string; scope: string; userId: string; requestHash: string },
  handler: () => Promise<{ status: number; body: unknown }>,
): Promise<IdempotentResult> {
  const { key, scope, userId, requestHash } = args

  const { data: claimed, error: claimError } = await supabase
    .from('idempotency_keys')
    .upsert(
      { key, scope, user_id: userId, request_hash: requestHash, status: 'reserved' },
      { onConflict: 'key,scope', ignoreDuplicates: true },
    )
    .select('key')
  if (claimError) throw new Error(claimError.message)

  if (claimed && claimed.length > 0) {
    const result = await handler()
    await supabase
      .from('idempotency_keys')
      .update({
        status: 'completed',
        response_status: result.status,
        response_body: result.body as never,
      })
      .eq('key', key)
      .eq('scope', scope)
    return { status: result.status, body: result.body, replayed: false }
  }

  const { data: existing } = await supabase
    .from('idempotency_keys')
    .select('status,request_hash,response_status,response_body')
    .eq('key', key)
    .eq('scope', scope)
    .maybeSingle()
  if (!existing) {
    throw new DomainError('Conflicto de idempotencia', 'idempotency_conflict')
  }
  if (existing.request_hash !== requestHash) {
    throw new DomainError(
      'Idempotency-Key reutilizada con un payload distinto',
      'idempotency_conflict',
    )
  }
  if (existing.status !== 'completed') {
    throw new DomainError('Solicitud idéntica en proceso; reintenta en un momento', 'conflict')
  }
  return { status: existing.response_status ?? 200, body: existing.response_body, replayed: true }
}
