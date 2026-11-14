import type { ProofObject } from './ports'

/**
 * Categorías que la base purga o anonimiza por lotes, sin archivos de por medio (migración
 * 0284). Cada lote devuelve cuántas filas tocó; la base pone el tope y el plazo.
 */
export const BATCH_CATEGORIES = [
  'customer_incidents',
  'phone_restrictions',
  'store_events',
  'push_delivery_log',
  'admin_alerts',
  // Antifraude (0286): ventana de 24 meses; lo que pasa de ella se anonimiza o se elimina.
  'customer_strikes',
  'address_directory',
  'phone_assignments',
  // Caja (0285): solo las notas; importes, estados y fechas no se tocan.
  'cash_settlements',
] as const
export type BatchCategory = (typeof BATCH_CATEGORIES)[number]

/** Categorías con una imagen en Storage que se borra ANTES de anonimizar la fila. */
export const FILE_CATEGORIES = ['reports', 'fraud_coverage_claims'] as const
export type FileCategory = (typeof FILE_CATEGORIES)[number]

export type RetentionCategory = BatchCategory | FileCategory

/** Una fila vencida y los archivos que solo ella usa (los que hay que borrar antes de cerrarla). */
export interface DueFileRow {
  rowId: string
  objects: ProofObject[]
}

/**
 * Lo que dice la base antes de tocar Storage, con la fila bloqueada: si `status` no es `ok`, no se
 * borra nada. `objects` son los únicos archivos que el job puede borrar (la lista de
 * `listDueFileRows` es solo informativa) y `token` identifica la marca de borrado que los protege.
 */
export interface FileRowPrecheck {
  status: 'ok' | 'not_due' | 'not_found'
  token: string | null
  objects: ProofObject[]
}

/**
 * Cómo terminó una fila con archivo:
 * - `anonymized`: datos y referencia anulados.
 * - `ref_kept`: anonimizada, pero la evidencia es una URL que la purga no controla y se conserva.
 * - `not_due` / `not_found`: la fila cambió entre la lista y el cierre; no se tocó.
 * - `object_remains`: su archivo sigue en Storage; no se tocó nada.
 * - `stale`: la marca que autorizó el borrado ya no vale; no se tocó nada.
 */
export const FILE_ROW_OUTCOMES = [
  'anonymized',
  'ref_kept',
  'not_due',
  'not_found',
  'object_remains',
  'stale',
] as const
export type FileRowOutcome = (typeof FILE_ROW_OUTCOMES)[number]

/** Las funciones de la base que aplican los plazos de conservación (migración 0284). */
export interface DataRetentionRepository {
  /** Purga o anonimiza un lote vencido de la categoría. Devuelve cuántas filas tocó (0 a `limit`). */
  purgeBatch(category: BatchCategory, limit: number): Promise<number>
  /** Filas vencidas en orden de id, solo las que vienen DESPUÉS de `afterId`. Como mucho `limit`. */
  listDueFileRows(category: FileCategory, limit: number, afterId?: string): Promise<DueFileRow[]>
  /** Se llama antes de tocar Storage: si no es `ok`, no se borra ningún archivo. */
  precheckFileRow(category: FileCategory, rowId: string): Promise<FileRowPrecheck>
  /** Anonimiza la fila; la base se niega (`object_remains`, `stale`) si su archivo aún existe o la marca no vale. */
  finishFileRow(
    category: FileCategory,
    rowId: string,
    token: string | null,
  ): Promise<FileRowOutcome>
}
