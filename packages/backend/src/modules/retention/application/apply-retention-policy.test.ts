import { describe, expect, it } from 'vitest'
import { createLogger, type LogLevel } from '../../../shared'
import { applyRetentionPolicy } from './apply-retention-policy'
import {
  BATCH_CATEGORIES,
  type BatchCategory,
  type DataRetentionRepository,
  type DueFileRow,
  type FileCategory,
  type FileRowOutcome,
  type FileRowPrecheck,
} from './data-retention-ports'
import type { ProofStorage } from './ports'

const rowId = (i: number) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`

interface Options {
  /** Filas pendientes por categoría de lote. */
  batchRows?: Partial<Record<BatchCategory, number>>
  failBatch?: (category: BatchCategory) => boolean
  /** Filas con archivo de `reports`. */
  fileRows?: DueFileRow[]
  /** Filas con archivo de `fraud_coverage_claims` (caja). */
  claimRows?: DueFileRow[]
  precheck?: (id: string) => FileRowPrecheck
  outcome?: (id: string) => FileRowOutcome
  failRemoveFor?: (paths: string[]) => boolean
  failList?: boolean
}

function build(options: Options) {
  const pending = new Map<BatchCategory, number>(
    Object.entries(options.batchRows ?? {}) as [BatchCategory, number][],
  )
  const batchCalls: { category: BatchCategory; limit: number }[] = []
  const pages: (string | undefined)[] = []
  const finished: string[] = []
  const removed: { bucket: string; paths: string[] }[] = []
  const lines: string[] = []
  const closed = new Set<string>()

  const retention: DataRetentionRepository = {
    purgeBatch: async (category, limit) => {
      batchCalls.push({ category, limit })
      if (options.failBatch?.(category)) throw new Error('la base no respondió 51999999999')
      const left = pending.get(category) ?? 0
      const touched = Math.min(left, limit)
      pending.set(category, left - touched)
      return touched
    },
    listDueFileRows: async (category: FileCategory, limit, afterId) => {
      if (options.failList) throw new Error('lista caída')
      if (category === 'reports') pages.push(afterId)
      const rows = category === 'reports' ? options.fileRows : options.claimRows
      return (rows ?? [])
        .filter((r) => !closed.has(r.rowId))
        .filter((r) => !afterId || r.rowId > afterId)
        .sort((a, b) => a.rowId.localeCompare(b.rowId))
        .slice(0, limit)
    },
    precheckFileRow: async (_category, id) => options.precheck?.(id) ?? 'ok',
    finishFileRow: async (_category, id) => {
      const outcome = options.outcome?.(id) ?? 'anonymized'
      if (outcome === 'anonymized' || outcome === 'ref_kept') {
        finished.push(id)
        closed.add(id)
      }
      return outcome
    },
  }
  const storage: ProofStorage = {
    remove: async (bucket, paths) => {
      if (options.failRemoveFor?.(paths)) throw new Error(`falló ${paths[0]}`)
      removed.push({ bucket, paths })
    },
  }
  const logger = createLogger({
    module: 'test',
    sink: { write: (_level: LogLevel, line: string) => void lines.push(line) },
  })
  return { retention, storage, logger, batchCalls, pages, finished, removed, lines, pending }
}

const fileRow = (i: number, files = 1): DueFileRow => ({
  rowId: rowId(i),
  objects: Array.from({ length: files }, (_, k) => ({
    bucket: 'payment-proofs',
    path: `${rowId(i)}/evidencia-${k}.jpg`,
  })),
})

describe('applyRetentionPolicy', () => {
  it('purga cada categoría por lotes hasta que un lote sale incompleto, y cuenta las filas', async () => {
    const f = build({ batchRows: { store_events: 1200, admin_alerts: 3 } })
    const summary = await applyRetentionPolicy(f)
    expect(summary.store_events).toEqual({ rows: 1200, files: 0, pending: 0, failed: 0 })
    expect(summary.admin_alerts.rows).toBe(3)
    expect(summary.phone_restrictions.rows).toBe(0)
    // 500 + 500 + 200: el tercer lote sale incompleto y la categoría termina.
    expect(f.batchCalls.filter((c) => c.category === 'store_events')).toHaveLength(3)
    expect(f.batchCalls.every((c) => c.limit === 500)).toBe(true)
    // Todas las categorías de lote se intentan.
    expect(new Set(f.batchCalls.map((c) => c.category))).toEqual(new Set(BATCH_CATEGORIES))
  })

  it('tiene un tope de lotes por corrida: lo que sobra queda para mañana', async () => {
    const f = build({ batchRows: { push_delivery_log: 50_000 } })
    const summary = await applyRetentionPolicy(f)
    expect(summary.push_delivery_log.rows).toBe(10_000)
    expect(f.pending.get('push_delivery_log')).toBe(40_000)
  })

  it('si una categoría falla, la registra y sigue con las demás', async () => {
    const f = build({
      batchRows: { customer_incidents: 2, store_events: 4 },
      failBatch: (c) => c === 'customer_incidents',
      fileRows: [fileRow(1)],
    })
    const summary = await applyRetentionPolicy(f)
    expect(summary.customer_incidents).toEqual({ rows: 0, files: 0, pending: 0, failed: 1 })
    expect(summary.store_events.rows).toBe(4)
    expect(summary.reports.rows).toBe(1)
    const failed = f.lines.find((l) => l.includes('data_retention_category_failed'))
    expect(failed).toContain('customer_incidents')
    // El mensaje del error (que podría llevar un teléfono) nunca llega al log.
    expect(f.lines.join('\n')).not.toContain('51999999999')
  })

  it('borra el archivo y luego anonimiza la fila', async () => {
    const f = build({ fileRows: [fileRow(1, 2), fileRow(2, 0)] })
    const summary = await applyRetentionPolicy(f)
    expect(summary.reports).toEqual({ rows: 2, files: 2, pending: 0, failed: 0 })
    expect(f.removed).toEqual([
      {
        bucket: 'payment-proofs',
        paths: [`${rowId(1)}/evidencia-0.jpg`, `${rowId(1)}/evidencia-1.jpg`],
      },
    ])
    expect(f.finished).toEqual([rowId(1), rowId(2)])
  })

  it('si Storage falla, no anonimiza esa fila y sigue con la siguiente', async () => {
    const f = build({
      fileRows: [fileRow(1), fileRow(2)],
      failRemoveFor: (paths) => paths.some((p) => p.startsWith(rowId(1))),
    })
    const summary = await applyRetentionPolicy(f)
    expect(f.finished).toEqual([rowId(2)])
    expect(summary.reports).toEqual({ rows: 1, files: 1, pending: 0, failed: 1 })
    expect(f.lines.join('\n')).not.toContain(rowId(1))
  })

  it('si el precheck no da ok, no toca Storage ni cierra la fila', async () => {
    const f = build({ fileRows: [fileRow(1)], precheck: () => 'not_due' })
    const summary = await applyRetentionPolicy(f)
    expect(f.removed).toEqual([])
    expect(f.finished).toEqual([])
    expect(summary.reports).toEqual({ rows: 0, files: 0, pending: 0, failed: 0 })
  })

  it('object_remains cuenta como fallo; ref_kept anonimiza y queda como pendiente', async () => {
    const f = build({
      fileRows: [fileRow(1), fileRow(2, 0)],
      outcome: (id) => (id === rowId(1) ? 'object_remains' : 'ref_kept'),
    })
    const summary = await applyRetentionPolicy(f)
    expect(summary.reports).toEqual({ rows: 1, files: 0, pending: 1, failed: 1 })
    expect(f.lines.some((l) => l.includes('data_retention_row_aborted'))).toBe(true)
  })

  it('avanza por cursor: 100 filas que siempre fallan no tapan a la 101', async () => {
    const rows = Array.from({ length: 101 }, (_, i) => fileRow(i))
    const fallan = new Set(rows.slice(0, 100).map((r) => r.rowId))
    const f = build({
      fileRows: rows,
      failRemoveFor: (paths) => paths.some((p) => fallan.has(p.slice(0, 36))),
    })
    const summary = await applyRetentionPolicy(f)
    expect(f.finished).toEqual([rowId(100)])
    expect(summary.reports.failed).toBe(100)
    expect(f.pages).toEqual([undefined, rowId(99)])
  })

  it('caja: las notas de liquidaciones van por lotes y los reclamos borran su imagen antes', async () => {
    const f = build({
      batchRows: { cash_settlements: 7 },
      claimRows: [fileRow(50, 1)],
    })
    const summary = await applyRetentionPolicy(f)
    expect(summary.cash_settlements).toEqual({ rows: 7, files: 0, pending: 0, failed: 0 })
    expect(summary.fraud_coverage_claims).toEqual({ rows: 1, files: 1, pending: 0, failed: 0 })
    expect(f.removed).toEqual([
      { bucket: 'payment-proofs', paths: [`${rowId(50)}/evidencia-0.jpg`] },
    ])
    expect(f.finished).toEqual([rowId(50)])
  })

  it('si la lista falla, la categoría cuenta un fallo y el resumen sale igual', async () => {
    const f = build({ failList: true, batchRows: { admin_alerts: 1 } })
    const summary = await applyRetentionPolicy(f)
    expect(summary.reports.failed).toBe(1)
    expect(summary.admin_alerts.rows).toBe(1)
    expect(f.lines.filter((l) => l.includes('data_retention_category_done'))).toHaveLength(8)
  })
})
