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
  type PendingTombstone,
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
  /** Lápidas que `applyFileRow` deja al cerrar una fila (por id de fila). */
  tombstonesOf?: (category: FileCategory, id: string) => PendingTombstone[]
  /** Lápidas de una corrida anterior que quedaron pendientes. */
  leftover?: PendingTombstone[]
  outcome?: (id: string) => FileRowOutcome
  failApplyFor?: (id: string) => boolean
  failRemoveFor?: (paths: string[]) => boolean
  failMark?: () => boolean
  failList?: boolean
}

function build(options: Options) {
  const pending = new Map<BatchCategory, number>(
    Object.entries(options.batchRows ?? {}) as [BatchCategory, number][],
  )
  const batchCalls: { category: BatchCategory; limit: number }[] = []
  const pages: (string | undefined)[] = []
  const applied: string[] = []
  const removed: { bucket: string; paths: string[] }[] = []
  const lines: string[] = []
  const closed = new Set<string>()
  const tombstones: (PendingTombstone & { deleted: boolean })[] = (options.leftover ?? []).map(
    (t) => ({ ...t, deleted: false }),
  )
  const order: string[] = []

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
    applyFileRow: async (category, id) => {
      if (options.failApplyFor?.(id)) throw new Error('la base se cayó')
      const outcome = options.outcome?.(id) ?? 'anonymized'
      order.push(`apply:${id}`)
      if (outcome === 'anonymized' || outcome === 'ref_kept') {
        applied.push(id)
        closed.add(id)
        for (const t of options.tombstonesOf?.(category, id) ?? []) {
          tombstones.push({ ...t, deleted: false })
        }
      }
      return outcome
    },
    listPendingTombstones: async (limit, after) =>
      tombstones
        .filter((t) => !t.deleted)
        .sort((a, b) => `${a.path}|${a.bucket}`.localeCompare(`${b.path}|${b.bucket}`))
        .filter((t) => !after || `${t.path}|${t.bucket}` > `${after.path}|${after.bucket}`)
        .slice(0, limit)
        .map(({ bucket, path, source }) => ({ bucket, path, source })),
    markTombstoneDeleted: async (bucket, path) => {
      if (options.failMark?.()) throw new Error('la base no respondió')
      order.push(`mark:${path}`)
      for (const t of tombstones) if (t.bucket === bucket && t.path === path) t.deleted = true
    },
  }
  const storage: ProofStorage = {
    remove: async (bucket, paths) => {
      if (options.failRemoveFor?.(paths)) throw new Error(`falló ${paths[0]}`)
      order.push(`remove:${paths.join(',')}`)
      removed.push({ bucket, paths })
    },
  }
  const logger = createLogger({
    module: 'test',
    sink: { write: (_level: LogLevel, line: string) => void lines.push(line) },
  })
  return {
    retention,
    storage,
    logger,
    batchCalls,
    pages,
    applied,
    removed,
    lines,
    pending,
    tombstones,
    order,
  }
}

const fileRow = (i: number): DueFileRow => ({ rowId: rowId(i) })
const tomb = (i: number, source: FileCategory = 'reports', bucket = 'payment-proofs') => ({
  bucket,
  path: `${rowId(i)}/evidencia.jpg`,
  source,
})
const own = (i: number) => (category: FileCategory, id: string) =>
  id === rowId(i) ? [tomb(i, category)] : []

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

  it('primero la base, después Storage: cierra la fila y borra el archivo desde la lápida', async () => {
    const f = build({ fileRows: [fileRow(1), fileRow(2)], tombstonesOf: own(1) })
    const summary = await applyRetentionPolicy(f)
    expect(summary.reports).toEqual({ rows: 2, files: 1, pending: 0, failed: 0 })
    expect(f.removed).toEqual([{ bucket: 'payment-proofs', paths: [`${rowId(1)}/evidencia.jpg`] }])
    // El orden importa: la fila se cierra ANTES de tocar Storage y la lápida se marca DESPUÉS.
    expect(f.order).toEqual([
      `apply:${rowId(1)}`,
      `apply:${rowId(2)}`,
      `remove:${rowId(1)}/evidencia.jpg`,
      `mark:${rowId(1)}/evidencia.jpg`,
    ])
    expect(f.tombstones.every((t) => t.deleted)).toBe(true)
  })

  it('si Storage falla, la fila ya está cerrada, la lápida queda pendiente y la siguiente corrida la reintenta', async () => {
    let falla = true
    const f = build({
      fileRows: [fileRow(1), fileRow(2)],
      tombstonesOf: (c, id) => [tomb(id === rowId(1) ? 1 : 2, c)],
      failRemoveFor: (paths) => falla && paths.some((p) => p.startsWith(rowId(1))),
    })
    const primera = await applyRetentionPolicy(f)
    expect(f.applied).toEqual([rowId(1), rowId(2)])
    // Las dos rutas van en el mismo lote de Storage (mismo bucket): falla el lote entero.
    expect(primera.reports).toEqual({ rows: 2, files: 0, pending: 0, failed: 1 })
    expect(f.tombstones.map((t) => t.deleted)).toEqual([false, false])
    expect(f.lines.join('\n')).not.toContain(rowId(1))

    falla = false
    const segunda = await applyRetentionPolicy(f)
    expect(segunda.reports).toEqual({ rows: 0, files: 2, pending: 0, failed: 0 })
    expect(f.tombstones.every((t) => t.deleted)).toBe(true)
  })

  it('si marcar la lápida falla tras borrar, cuenta un fallo y la corrida siguiente la cierra (idempotente)', async () => {
    let falla = true
    const f = build({ leftover: [tomb(1)], failMark: () => falla })
    const primera = await applyRetentionPolicy(f)
    expect(primera.reports.failed).toBe(1)
    expect(f.tombstones[0]?.deleted).toBe(false)
    falla = false
    const segunda = await applyRetentionPolicy(f)
    expect(segunda.reports).toMatchObject({ files: 1, failed: 0 })
    // Storage recibió el mismo borrado dos veces: un objeto que ya no existe no es un error.
    expect(f.removed).toHaveLength(2)
  })

  it('una lápida de una corrida anterior se retoma aunque hoy no haya filas vencidas', async () => {
    const f = build({ leftover: [tomb(7, 'fraud_coverage_claims', 'receipts')] })
    const summary = await applyRetentionPolicy(f)
    expect(f.removed).toEqual([{ bucket: 'receipts', paths: [`${rowId(7)}/evidencia.jpg`] }])
    expect(summary.fraud_coverage_claims).toMatchObject({ rows: 0, files: 1, failed: 0 })
  })

  it('una fila que ya no vence no deja lápida ni toca Storage', async () => {
    const f = build({
      fileRows: [fileRow(1)],
      outcome: () => 'not_due',
      tombstonesOf: own(1),
    })
    const summary = await applyRetentionPolicy(f)
    expect(f.removed).toEqual([])
    expect(f.tombstones).toEqual([])
    expect(summary.reports).toEqual({ rows: 0, files: 0, pending: 0, failed: 0 })
    expect(f.lines.some((l) => l.includes('data_retention_row_changed'))).toBe(true)
  })

  it('si la base falla con una fila, cuenta un fallo y sigue con la siguiente', async () => {
    const f = build({
      fileRows: [fileRow(1), fileRow(2)],
      failApplyFor: (id) => id === rowId(1),
    })
    const summary = await applyRetentionPolicy(f)
    expect(f.applied).toEqual([rowId(2)])
    expect(summary.reports).toMatchObject({ rows: 1, failed: 1 })
    expect(f.lines.join('\n')).not.toContain(rowId(1))
  })

  it('ref_kept anonimiza y queda como pendiente, sin Storage', async () => {
    const f = build({ fileRows: [fileRow(1)], outcome: () => 'ref_kept' })
    const summary = await applyRetentionPolicy(f)
    expect(summary.reports).toEqual({ rows: 1, files: 0, pending: 1, failed: 0 })
    expect(f.removed).toEqual([])
  })

  it('avanza por cursor: 100 filas que siempre fallan no tapan a la 101', async () => {
    const rows = Array.from({ length: 101 }, (_, i) => fileRow(i))
    const fallan = new Set(rows.slice(0, 100).map((r) => r.rowId))
    const f = build({ fileRows: rows, failApplyFor: (id) => fallan.has(id) })
    const summary = await applyRetentionPolicy(f)
    expect(f.applied).toEqual([rowId(100)])
    expect(summary.reports.failed).toBe(100)
    expect(f.pages).toEqual([undefined, rowId(99)])
  })

  it('las lápidas se leen por cursor: un lote que falla no tapa a los demás', async () => {
    const leftover = Array.from({ length: 101 }, (_, i) => tomb(i))
    const f = build({ leftover, failRemoveFor: (paths) => paths.length > 1 })
    const summary = await applyRetentionPolicy(f)
    // La primera página (100 rutas, un solo bucket) falla entera; la 101 sí se borra.
    expect(summary.reports).toMatchObject({ files: 1, failed: 1 })
    expect(f.tombstones.filter((t) => t.deleted)).toHaveLength(1)
  })

  it('caja: las notas de liquidaciones van por lotes y los reclamos dejan su lápida', async () => {
    const f = build({
      batchRows: { cash_settlements: 7 },
      claimRows: [fileRow(50)],
      tombstonesOf: own(50),
    })
    const summary = await applyRetentionPolicy(f)
    expect(summary.cash_settlements).toEqual({ rows: 7, files: 0, pending: 0, failed: 0 })
    expect(summary.fraud_coverage_claims).toEqual({ rows: 1, files: 1, pending: 0, failed: 0 })
    expect(f.removed).toEqual([{ bucket: 'payment-proofs', paths: [`${rowId(50)}/evidencia.jpg`] }])
    expect(f.applied).toEqual([rowId(50)])
  })

  it('si la lista falla, la categoría cuenta un fallo y el resumen sale igual', async () => {
    const f = build({ failList: true, batchRows: { admin_alerts: 1 } })
    const summary = await applyRetentionPolicy(f)
    expect(summary.reports.failed).toBe(1)
    expect(summary.admin_alerts.rows).toBe(1)
    expect(f.lines.filter((l) => l.includes('data_retention_category_done'))).toHaveLength(11)
  })
})
