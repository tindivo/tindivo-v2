import type { Logger } from '../../../shared'
import {
  BATCH_CATEGORIES,
  type BatchCategory,
  type DataRetentionRepository,
  FILE_CATEGORIES,
  type FileCategory,
  type PendingTombstone,
  type RetentionCategory,
  type TombstoneCursor,
} from './data-retention-ports'
import type { ProofStorage } from './ports'

/** Filas por lote de las categorías sin archivo (la base acepta hasta 1000). */
const BATCH_SIZE = 500
/** Lotes por categoría y corrida: hasta 10 000 filas. Lo que sobre sigue vencido para mañana. */
const MAX_BATCHES = 20
/** Filas con archivo por página (el tope de la base). */
const ROWS_PER_PAGE = 100
/** Páginas por categoría y corrida: hasta 1000 filas con archivo. */
const MAX_PAGES = 10
/** Lápidas por página (el tope de la base) y por llamada a Storage. */
const TOMBSTONES_PER_PAGE = 100
/** Páginas de lápidas por corrida: hasta 2000 archivos. Lo que sobre sigue pendiente para mañana. */
const MAX_TOMBSTONE_PAGES = 20

export interface CategorySummary {
  /** Filas purgadas o anonimizadas. */
  rows: number
  /** Archivos borrados de Storage (por las lápidas que dejó esa categoría). */
  files: number
  /** Filas anonimizadas cuya evidencia es una URL que la purga no controla (quedan para revisión). */
  pending: number
  /** Fallos: la categoría entera (lote), filas sueltas o borrados de Storage. Se reintenta en la corrida siguiente. */
  failed: number
}

export type RetentionSummary = Record<RetentionCategory, CategorySummary>

export interface ApplyRetentionDeps {
  retention: DataRetentionRepository
  storage: ProofStorage
  logger: Logger
}

const empty = (): CategorySummary => ({ rows: 0, files: 0, pending: 0, failed: 0 })

async function runBatchCategory(
  category: BatchCategory,
  deps: ApplyRetentionDeps,
  summary: CategorySummary,
): Promise<void> {
  try {
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const touched = await deps.retention.purgeBatch(category, BATCH_SIZE)
      summary.rows += touched
      if (touched < BATCH_SIZE) break
    }
  } catch (error) {
    summary.failed += 1
    deps.logger.error('data_retention_category_failed', { category, error })
  }
}

/**
 * Una fila con archivo: la base la revalida y la cierra en UNA transacción (referencia fuera y lápida
 * de la imagen). Aquí no se toca Storage: eso ocurre después, desde las lápidas (`drainTombstones`).
 */
async function runFileCategory(
  category: FileCategory,
  deps: ApplyRetentionDeps,
  summary: CategorySummary,
): Promise<void> {
  const { retention, logger } = deps
  let afterId: string | undefined
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const due = await retention.listDueFileRows(category, ROWS_PER_PAGE, afterId)
      const last = due.at(-1)
      if (!last) break
      afterId = last.rowId

      for (const { rowId } of due) {
        try {
          const outcome = await retention.applyFileRow(category, rowId)
          if (outcome === 'anonymized' || outcome === 'ref_kept') {
            summary.rows += 1
            if (outcome === 'ref_kept') summary.pending += 1
          } else {
            // La fila cambió entre la lista y la transacción (se reabrió o se borró): no se tocó.
            logger.warn('data_retention_row_changed', { category, outcome })
          }
        } catch (error) {
          summary.failed += 1
          logger.error('data_retention_row_failed', { category, error })
        }
      }
      if (due.length < ROWS_PER_PAGE) break
    }
  } catch (error) {
    summary.failed += 1
    logger.error('data_retention_category_failed', { category, error })
  }
}

function groupByBucket(tombstones: PendingTombstone[]): Map<string, PendingTombstone[]> {
  const byBucket = new Map<string, PendingTombstone[]>()
  for (const tombstone of tombstones) {
    const group = byBucket.get(tombstone.bucket) ?? []
    group.push(tombstone)
    byBucket.set(tombstone.bucket, group)
  }
  return byBucket
}

/**
 * Borra en Storage las rutas de las lápidas pendientes y las marca como borradas. Idempotente: si el
 * objeto ya no existe, Storage no da error y la lápida se cierra; si falla, queda pendiente y se
 * reintenta en la corrida siguiente. Es independiente de las filas: una lápida de una corrida anterior
 * que falló se retoma aquí.
 */
async function drainTombstones(
  deps: ApplyRetentionDeps,
  summaries: Record<FileCategory, CategorySummary>,
): Promise<void> {
  const { retention, storage, logger } = deps
  let after: TombstoneCursor | undefined
  try {
    for (let page = 0; page < MAX_TOMBSTONE_PAGES; page++) {
      const tombstones = await retention.listPendingTombstones(TOMBSTONES_PER_PAGE, after)
      const last = tombstones.at(-1)
      if (!last) break
      after = { bucket: last.bucket, path: last.path }

      for (const [bucket, group] of groupByBucket(tombstones)) {
        try {
          await storage.remove(
            bucket,
            group.map((g) => g.path),
          )
          for (const { path, source } of group) {
            await retention.markTombstoneDeleted(bucket, path)
            summaries[source].files += 1
          }
        } catch (error) {
          for (const source of new Set(group.map((g) => g.source))) summaries[source].failed += 1
          logger.error('data_retention_storage_failed', { error })
        }
      }
      if (tombstones.length < TOMBSTONES_PER_PAGE) break
    }
  } catch (error) {
    for (const category of FILE_CATEGORIES) summaries[category].failed += 1
    logger.error('data_retention_tombstones_failed', { error })
  }
}

/**
 * Plazos de conservación (migración 0284): cada categoría se purga o anonimiza por su cuenta;
 * si una falla, se registra y las demás siguen. Las filas con imagen se cierran primero en la base
 * (una transacción por fila: referencia fuera y lápida) y Storage se borra después, desde las
 * lápidas: ninguna fila puede adoptar una ruta con lápida, tarde lo que tarde el borrado. El log
 * lleva la categoría y los conteos, nunca ids, rutas ni mensajes de error.
 */
export async function applyRetentionPolicy(deps: ApplyRetentionDeps): Promise<RetentionSummary> {
  const summary = {} as RetentionSummary
  for (const category of BATCH_CATEGORIES) {
    summary[category] = empty()
    await runBatchCategory(category, deps, summary[category])
    deps.logger.info('data_retention_category_done', { category, ...summary[category] })
  }
  for (const category of FILE_CATEGORIES) {
    summary[category] = empty()
    await runFileCategory(category, deps, summary[category])
  }
  await drainTombstones(deps, summary)
  for (const category of FILE_CATEGORIES) {
    deps.logger.info('data_retention_category_done', { category, ...summary[category] })
  }
  return summary
}
