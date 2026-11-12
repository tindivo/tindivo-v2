import type { Logger } from '../../../shared'
import {
  BATCH_CATEGORIES,
  type BatchCategory,
  type DataRetentionRepository,
  FILE_CATEGORIES,
  type FileCategory,
  type RetentionCategory,
} from './data-retention-ports'
import type { ProofObject, ProofStorage } from './ports'

/** Filas por lote de las categorías sin archivo (la base acepta hasta 1000). */
const BATCH_SIZE = 500
/** Lotes por categoría y corrida: hasta 10 000 filas. Lo que sobre sigue vencido para mañana. */
const MAX_BATCHES = 20
/** Filas con archivo por página (el tope de la base). */
const ROWS_PER_PAGE = 100
/** Páginas por categoría y corrida: hasta 1000 filas con archivo. */
const MAX_PAGES = 10
/** Archivos por llamada a Storage. */
const OBJECTS_PER_REMOVE = 100

export interface CategorySummary {
  /** Filas purgadas o anonimizadas. */
  rows: number
  /** Archivos borrados de Storage. */
  files: number
  /** Filas anonimizadas cuya evidencia es una URL que la purga no controla (quedan para revisión). */
  pending: number
  /** Fallos: la categoría entera (lote) o filas sueltas (con archivo). Se reintenta mañana. */
  failed: number
}

export type RetentionSummary = Record<RetentionCategory, CategorySummary>

export interface ApplyRetentionDeps {
  retention: DataRetentionRepository
  storage: ProofStorage
  logger: Logger
}

const empty = (): CategorySummary => ({ rows: 0, files: 0, pending: 0, failed: 0 })

function groupByBucket(objects: ProofObject[]): Map<string, string[]> {
  const byBucket = new Map<string, string[]>()
  for (const { bucket, path } of objects) {
    const paths = byBucket.get(bucket) ?? []
    paths.push(path)
    byBucket.set(bucket, paths)
  }
  return byBucket
}

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

async function runFileCategory(
  category: FileCategory,
  deps: ApplyRetentionDeps,
  summary: CategorySummary,
): Promise<void> {
  const { retention, storage, logger } = deps
  let afterId: string | undefined
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const due = await retention.listDueFileRows(category, ROWS_PER_PAGE, afterId)
      const last = due.at(-1)
      if (!last) break
      afterId = last.rowId

      for (const { rowId, objects } of due) {
        try {
          // Antes de tocar Storage: una fila que ya no vence no pierde su archivo.
          if ((await retention.precheckFileRow(category, rowId)) !== 'ok') continue
          for (const [bucket, paths] of groupByBucket(objects)) {
            for (let i = 0; i < paths.length; i += OBJECTS_PER_REMOVE) {
              await storage.remove(bucket, paths.slice(i, i + OBJECTS_PER_REMOVE))
            }
          }
          const outcome = await retention.finishFileRow(category, rowId)
          if (outcome === 'anonymized' || outcome === 'ref_kept') {
            summary.rows += 1
            summary.files += objects.length
            if (outcome === 'ref_kept') summary.pending += 1
          } else if (outcome === 'object_remains') {
            summary.failed += 1
            logger.warn('data_retention_row_aborted', { category, outcome })
          } else {
            // La fila cambió entre la lista y el cierre (se reabrió o se borró): no se tocó.
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

/**
 * Plazos de conservación (migración 0284): cada categoría se purga o anonimiza por su cuenta;
 * si una falla, se registra y las demás siguen. Las filas con imagen borran primero el archivo
 * por la API de Storage y solo después se anonimizan. El log lleva la categoría y los conteos,
 * nunca ids, rutas ni mensajes de error.
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
    deps.logger.info('data_retention_category_done', { category, ...summary[category] })
  }
  return summary
}
