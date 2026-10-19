import type { TypedSupabaseClient } from '@tindivo/supabase'
import { z } from 'zod'
import {
  type DueAccount,
  type DueCursor,
  type ProofObject,
  PURGE_ABORT_REASONS,
  PurgeAbortedError,
  type PurgeAbortReason,
  type PurgeOutcome,
  type RetentionRepository,
} from '../application/ports'

interface RpcError {
  message: string
  code?: string
}

/**
 * `database.types.ts` se genera desde `tindivo-prod` y aún no trae la 0269: hasta el próximo
 * `pnpm db:types` (después del `db push`), el cliente se ve con la forma que tienen estas tres.
 */
interface RetentionRpcClient {
  rpc(
    name: 'list_proof_purge_due',
    args: { p_limit: number; p_after_deleted_at?: string; p_after_user_id?: string },
  ): PromiseLike<{
    data: { user_id: string; deleted_at: string }[] | null
    error: RpcError | null
  }>
  rpc(
    name: 'proof_purge_precheck',
    args: { p_user_id: string },
  ): PromiseLike<{ data: string | null; error: RpcError | null }>
  rpc(
    name: 'list_user_proof_objects',
    args: { p_user_id: string },
  ): PromiseLike<{ data: { bucket_id: string; name: string }[] | null; error: RpcError | null }>
  rpc(
    name: 'finish_proof_purge',
    args: { p_user_id: string },
  ): PromiseLike<{ data: unknown; error: RpcError | null }>
}

const PurgeOutcomeSchema = z.object({
  status: z.enum(['purged', 'already_purged']),
  orders: z.number().int().nonnegative(),
  reports: z.number().int().nonnegative(),
})

/** Llama a las funciones de la 0269 con el cliente service-role. Único sitio del módulo con SDK (DES-2). */
export class SupabaseRetentionRepository implements RetentionRepository {
  constructor(private readonly supabase: () => TypedSupabaseClient) {}

  private client(): RetentionRpcClient {
    return this.supabase() as unknown as RetentionRpcClient
  }

  async listDueAccounts(limit: number, after?: DueCursor): Promise<DueAccount[]> {
    const { data, error } = await this.client().rpc('list_proof_purge_due', {
      p_limit: limit,
      ...(after ? { p_after_deleted_at: after.deletedAt, p_after_user_id: after.userId } : {}),
    })
    if (error) throw new Error(`No se pudo listar las cuentas por purgar: ${error.message}`)
    return (data ?? []).map((row) => ({ userId: row.user_id, deletedAt: row.deleted_at }))
  }

  async precheck(userId: string): Promise<'ok' | PurgeAbortReason> {
    const { data, error } = await this.client().rpc('proof_purge_precheck', { p_user_id: userId })
    if (error) throw new Error(`No se pudo comprobar la cuenta: ${error.message}`)
    if (data === 'ok') return 'ok'
    const reason = PURGE_ABORT_REASONS.find((r) => r === data)
    if (!reason) throw new Error('El precheck de la purga devolvió algo inesperado')
    return reason
  }

  async listProofObjects(userId: string): Promise<ProofObject[]> {
    const { data, error } = await this.client().rpc('list_user_proof_objects', {
      p_user_id: userId,
    })
    if (error) throw new Error(`No se pudo listar los comprobantes: ${error.message}`)
    return (data ?? []).map((row) => ({ bucket: row.bucket_id, path: row.name }))
  }

  async finishPurge(userId: string): Promise<PurgeOutcome> {
    const { data, error } = await this.client().rpc('finish_proof_purge', { p_user_id: userId })
    if (error) {
      const reason = PURGE_ABORT_REASONS.find((r) => r === error.message)
      if (error.code === 'P0001' && reason) throw new PurgeAbortedError(reason)
      throw new Error(`No se pudo cerrar la purga: ${error.message}`)
    }
    return PurgeOutcomeSchema.parse(data)
  }
}
