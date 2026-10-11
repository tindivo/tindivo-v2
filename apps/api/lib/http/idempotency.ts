import { DomainError } from '@tindivo/core'
import type { TypedSupabaseClient } from '@tindivo/supabase'

export interface IdempotentResult {
  status: number
  body: unknown
  replayed: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Las claves de creación son UUID (la columna lo es): se rechaza antes de tocar la base. */
export function isIdempotencyKey(value: string): boolean {
  return UUID_RE.test(value)
}

export type CreationScope = 'create_order' | 'create_courier_order'

/**
 * Replay temprano de una CREACIÓN (restaurantes / Entregas), aislado por usuario:
 * la clave de A nunca devuelve nada a B (H-4). Úsalo ANTES de los guards que
 * dependen del estado actual (teléfono, tope de contraentrega, pausa, horario):
 * un reintento de un pedido ya creado debe ver su respuesta original aunque el
 * estado haya cambiado entre medio.
 *
 *  · `null`      → no hay clave guardada para este usuario: sigue el flujo normal.
 *  · `{ conflict: true }` → la clave existe con OTRO payload.
 *  · `{ body }`  → la respuesta original (`{ data }`), tal como se devolvió al crear.
 */
export async function findStoredCreation(
  supabase: TypedSupabaseClient,
  args: { userId: string; scope: CreationScope; key: string; requestHash: string },
): Promise<{ body: { data: unknown } } | { conflict: true } | { inFlight: true } | null> {
  const { data } = await supabase
    .from('creation_idempotency')
    .select('request_hash,response,expires_at')
    .eq('user_id', args.userId)
    .eq('scope', args.scope)
    .eq('key', args.key)
    .maybeSingle()
  // Una fila vencida y sin purgar ya no vale (la RPC la descarta igual).
  if (data && Date.parse(data.expires_at) > Date.now()) {
    if (data.request_hash !== args.requestHash) return { conflict: true }
    return { body: { data: data.response } }
  }

  // Compatibilidad de despliegue: una creación hecha por la API ANTERIOR solo
  // dejó su clave en `idempotency_keys`. Sin mirar allí, el primer reintento
  // tras el despliegue duplicaría el pedido. Siempre filtrado por usuario.
  const { data: legacy } = await supabase
    .from('idempotency_keys')
    .select('status,request_hash,response_body,expires_at')
    .eq('key', args.key)
    .eq('scope', args.scope)
    .eq('user_id', args.userId)
    .maybeSingle()
  if (!legacy || Date.parse(legacy.expires_at) <= Date.now()) return null
  if (legacy.request_hash !== args.requestHash) return { conflict: true }
  if (legacy.status === 'completed') {
    return { body: legacy.response_body as { data: unknown } }
  }
  // `reserved`: la API anterior la reclamó y no guardó la respuesta. No hay forma
  // de saber si el pedido llegó a crearse (la antigüedad no prueba abandono: si
  // se creó y ya terminó o se canceló, los guards de activos dejarían crear
  // otro), y la tabla vieja no guarda a qué pedido corresponde. Sin una
  // asociación verificable se conserva el 409 hasta que la fila venza (24 h),
  // que es lo que ya hacía la API anterior.
  return { inFlight: true }
}

/**
 * Crea el pedido y registra su clave EN LA MISMA TRANSACCIÓN
 * (`create_order_idempotently`, 0251). No hay estado «reservado» que pueda
 * quedar colgado si el proceso cae: o están el pedido y su clave, o ninguno.
 * Devuelve el error de PostgREST tal cual para que la ruta conserve su propia
 * traducción de errores (`IK409` = misma clave con otro payload).
 */
export async function createIdempotently(
  supabase: TypedSupabaseClient,
  args: {
    userId: string
    scope: CreationScope
    key: string
    requestHash: string
    args: Record<string, unknown>
  },
): Promise<{
  data: { replayed: boolean; data: unknown } | null
  error: { code: string; message: string; details?: string } | null
}> {
  const { data, error } = await supabase.rpc('create_order_idempotently', {
    p_user_id: args.userId,
    p_scope: args.scope,
    p_key: args.key,
    p_request_hash: args.requestHash,
    p_args: args.args as never,
  })
  if (error) return { data: null, error }
  return { data: data as { replayed: boolean; data: unknown }, error: null }
}

/**
 * Idempotencia estilo Stripe del wrapper LEGADO (fraude, incidentes, traspasos;
 * la creación de pedidos usa `createIdempotently`). Reclama la clave con un
 * INSERT atómico (ON CONFLICT DO NOTHING vía upsert ignoreDuplicates). Si la
 * reclama, ejecuta la operación y guarda la respuesta. Si ya existía: reproduce
 * la respuesta almacenada, o rechaza si el payload difiere / sigue en vuelo.
 * La respuesta almacenada solo se reproduce al MISMO usuario (H-4).
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
    .eq('user_id', userId)
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
