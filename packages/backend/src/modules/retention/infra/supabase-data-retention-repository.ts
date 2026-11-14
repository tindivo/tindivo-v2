import type { TypedSupabaseClient } from '@tindivo/supabase'
import { z } from 'zod'
import {
  type BatchCategory,
  type DataRetentionRepository,
  type DueFileRow,
  FILE_ROW_OUTCOMES,
  type FileCategory,
  type FileRowOutcome,
  type PendingTombstone,
  type TombstoneCursor,
} from '../application/data-retention-ports'

interface RpcError {
  message: string
  code?: string
}

/**
 * `database.types.ts` se genera desde `tindivo-prod` y aún no trae la 0284: hasta el próximo
 * `pnpm db:types` (después del `db push`), el cliente se ve con esta forma y cada respuesta se
 * valida con Zod.
 */
interface DataRetentionRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>
}

/** Función de la base que purga o anonimiza un lote de cada categoría (0284). */
const BATCH_RPC: Record<BatchCategory, string> = {
  customer_incidents: 'anonymize_old_customer_incidents',
  phone_restrictions: 'purge_old_phone_restrictions',
  store_events: 'purge_old_store_events',
  push_delivery_log: 'purge_old_push_delivery_log',
  admin_alerts: 'purge_old_admin_alerts',
  cash_settlements: 'anonymize_old_cash_settlement_notes',
  customer_strikes: 'anonymize_old_customer_strikes',
  address_directory: 'purge_old_address_directory',
  phone_assignments: 'purge_old_phone_assignments',
}

/** Las dos funciones de cada categoría con archivo (0284, 0285). */
const FILE_RPC: Record<FileCategory, { list: string; apply: string; id: string }> = {
  reports: {
    list: 'list_report_retention_due',
    apply: 'report_retention_apply',
    id: 'p_report_id',
  },
  fraud_coverage_claims: {
    list: 'list_fraud_claim_retention_due',
    apply: 'fraud_claim_retention_apply',
    id: 'p_claim_id',
  },
}

const CountSchema = z.number().int().nonnegative()
const DueRowsSchema = z.array(z.object({ row_id: z.guid() }))
const OutcomeSchema = z.enum(FILE_ROW_OUTCOMES)
const TombstonesSchema = z.array(
  z.object({
    bucket: z.string().min(1),
    path: z.string().min(1),
    source_table: z.enum(['reports', 'fraud_coverage_claims']),
  }),
)

/** Llama a las funciones de la 0284 con el cliente service-role. Único sitio del módulo con SDK (DES-2). */
export class SupabaseDataRetentionRepository implements DataRetentionRepository {
  constructor(private readonly supabase: () => TypedSupabaseClient) {}

  private client(): DataRetentionRpcClient {
    return this.supabase() as unknown as DataRetentionRpcClient
  }

  async purgeBatch(category: BatchCategory, limit: number): Promise<number> {
    const { data, error } = await this.client().rpc(BATCH_RPC[category], { p_limit: limit })
    if (error) throw new Error(`No se pudo aplicar el plazo de ${category}: ${error.message}`)
    return CountSchema.parse(data)
  }

  async listDueFileRows(
    category: FileCategory,
    limit: number,
    afterId?: string,
  ): Promise<DueFileRow[]> {
    const { data, error } = await this.client().rpc(FILE_RPC[category].list, {
      p_limit: limit,
      ...(afterId ? { p_after_id: afterId } : {}),
    })
    if (error) throw new Error(`No se pudo listar lo vencido de ${category}: ${error.message}`)
    return DueRowsSchema.parse(data ?? []).map((row) => ({ rowId: row.row_id }))
  }

  async applyFileRow(category: FileCategory, rowId: string): Promise<FileRowOutcome> {
    const rpc = FILE_RPC[category]
    const { data, error } = await this.client().rpc(rpc.apply, { [rpc.id]: rowId })
    if (error)
      throw new Error(`No se pudo aplicar el plazo a la fila de ${category}: ${error.message}`)
    return OutcomeSchema.parse(data)
  }

  async listPendingTombstones(limit: number, after?: TombstoneCursor): Promise<PendingTombstone[]> {
    const { data, error } = await this.client().rpc('retention_pending_tombstones', {
      p_limit: limit,
      ...(after ? { p_after_path: after.path, p_after_bucket: after.bucket } : {}),
    })
    if (error) throw new Error(`No se pudo listar las lápidas de Storage: ${error.message}`)
    return TombstonesSchema.parse(data ?? []).map((row) => ({
      bucket: row.bucket,
      path: row.path,
      source: row.source_table,
    }))
  }

  async markTombstoneDeleted(bucket: string, path: string): Promise<void> {
    const { error } = await this.client().rpc('retention_tombstone_done', {
      p_bucket: bucket,
      p_path: path,
    })
    if (error) throw new Error(`No se pudo marcar la lápida como borrada: ${error.message}`)
  }
}
