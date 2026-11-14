import type { TypedSupabaseClient } from '@tindivo/supabase'
import { z } from 'zod'
import {
  type BatchCategory,
  type DataRetentionRepository,
  type DueFileRow,
  FILE_ROW_OUTCOMES,
  type FileCategory,
  type FileRowOutcome,
  type FileRowPrecheck,
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

/** Las tres funciones de cada categoría con archivo (0284). */
const FILE_RPC: Record<
  FileCategory,
  { list: string; precheck: string; finish: string; id: string }
> = {
  reports: {
    list: 'list_report_retention_due',
    precheck: 'report_retention_precheck',
    finish: 'finish_report_retention',
    id: 'p_report_id',
  },
  fraud_coverage_claims: {
    list: 'list_fraud_claim_retention_due',
    precheck: 'fraud_claim_retention_precheck',
    finish: 'finish_fraud_claim_retention',
    id: 'p_claim_id',
  },
}

const CountSchema = z.number().int().nonnegative()
const DueRowsSchema = z.array(
  z.object({
    row_id: z.guid(),
    objects: z.array(z.object({ bucket: z.string().min(1), path: z.string().min(1) })),
  }),
)
const PrecheckSchema = z.object({
  status: z.enum(['ok', 'not_due', 'not_found']),
  token: z.guid().nullable(),
  objects: z.array(z.object({ bucket: z.string().min(1), path: z.string().min(1) })),
})
const OutcomeSchema = z.enum(FILE_ROW_OUTCOMES)

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
    return DueRowsSchema.parse(data ?? []).map((row) => ({
      rowId: row.row_id,
      objects: row.objects,
    }))
  }

  async precheckFileRow(category: FileCategory, rowId: string): Promise<FileRowPrecheck> {
    const rpc = FILE_RPC[category]
    const { data, error } = await this.client().rpc(rpc.precheck, { [rpc.id]: rowId })
    if (error) throw new Error(`No se pudo comprobar la fila de ${category}: ${error.message}`)
    return PrecheckSchema.parse(data)
  }

  async finishFileRow(
    category: FileCategory,
    rowId: string,
    token: string | null,
  ): Promise<FileRowOutcome> {
    const rpc = FILE_RPC[category]
    const { data, error } = await this.client().rpc(rpc.finish, {
      [rpc.id]: rowId,
      ...(token ? { p_token: token } : {}),
    })
    if (error) throw new Error(`No se pudo cerrar la fila de ${category}: ${error.message}`)
    return OutcomeSchema.parse(data)
  }
}
