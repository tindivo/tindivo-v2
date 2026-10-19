import type { Logger } from '../../../shared'
import type { ProofObject, ProofStorage, RetentionRepository } from './ports'

/** Cuentas que la base entrega por consulta (su tope, `list_proof_purge_due`). */
const ACCOUNTS_PER_BATCH = 100
/** Archivos por llamada a Storage. */
const OBJECTS_PER_REMOVE = 100
/** Tope de consultas por corrida: hasta 1000 cuentas; lo que sobre sigue vencido para mañana. */
const MAX_BATCHES = 10

export interface PurgeSummary {
  /** Cuentas cuya purga terminó en esta corrida. */
  accounts: number
  /** Archivos borrados de Storage. */
  objects: number
  /** Filas a las que se les quitó una referencia (pedidos y reportes). */
  rows: number
  /** Cuentas que fallaron y se reintentan en la próxima corrida. */
  failed: number
}

export interface PurgeDeps {
  retention: RetentionRepository
  storage: ProofStorage
  logger: Logger
}

function groupByBucket(objects: ProofObject[]): Map<string, string[]> {
  const byBucket = new Map<string, string[]>()
  for (const { bucket, path } of objects) {
    const paths = byBucket.get(bucket) ?? []
    paths.push(path)
    byBucket.set(bucket, paths)
  }
  return byBucket
}

/**
 * D-44, comprobantes a los 90 días: para cada cuenta borrada vencida, borra sus archivos por
 * la API de Storage y, solo si ninguno falló, quita las referencias (`finishPurge`). Una
 * cuenta que falla se registra y no frena a las demás; sigue vencida y se reintenta mañana.
 * El log nunca lleva ids, rutas ni mensajes de error: solo el tipo de error.
 */
export async function purgeDeletedAccountProofs(deps: PurgeDeps): Promise<PurgeSummary> {
  const { retention, storage, logger } = deps
  const summary: PurgeSummary = { accounts: 0, objects: 0, rows: 0, failed: 0 }
  const attempted = new Set<string>()

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const due = await retention.listDueAccounts(ACCOUNTS_PER_BATCH)
    const fresh = due.filter((userId) => !attempted.has(userId))
    // Todo lo que queda ya se intentó (y falló): volver a pedirlo no avanza.
    if (fresh.length === 0) break

    for (const userId of fresh) {
      attempted.add(userId)
      try {
        const objects = await retention.listProofObjects(userId)
        for (const [bucket, paths] of groupByBucket(objects)) {
          for (let i = 0; i < paths.length; i += OBJECTS_PER_REMOVE) {
            await storage.remove(bucket, paths.slice(i, i + OBJECTS_PER_REMOVE))
          }
        }
        const outcome = await retention.finishPurge(userId)
        summary.accounts += 1
        summary.objects += objects.length
        summary.rows += outcome.orders + outcome.reports
      } catch (error) {
        summary.failed += 1
        logger.error('proof_purge_account_failed', { error })
      }
    }
  }

  logger.info('proof_purge_done', { ...summary })
  return summary
}
