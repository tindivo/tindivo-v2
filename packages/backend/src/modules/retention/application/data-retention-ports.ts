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

/** Una fila vencida con imagen o datos por anonimizar. Es informativa: la base la revalida al aplicarla. */
export interface DueFileRow {
  rowId: string
}

/**
 * Cómo terminó una fila con archivo (una sola transacción en la base, con la fila bloqueada):
 * - `anonymized`: datos y referencia anulados; si la imagen era solo de esa fila, ya tiene lápida.
 * - `ref_kept`: anonimizada, pero la evidencia es una URL que la purga no controla y se conserva.
 * - `not_due` / `not_found`: la fila cambió entre la lista y la transacción (se reabrió, ya estaba
 *   anonimizada o se borró): no se tocó. No es un fallo.
 */
export const FILE_ROW_OUTCOMES = ['anonymized', 'ref_kept', 'not_due', 'not_found'] as const
export type FileRowOutcome = (typeof FILE_ROW_OUTCOMES)[number]

/** Una ruta con lápida cuyo archivo aún no se borró de Storage. */
export interface PendingTombstone {
  bucket: string
  path: string
  /** La categoría cuya fila soltó la referencia. */
  source: FileCategory
}

/** Posición desde la que sigue la lista de lápidas: la última ya vista. */
export interface TombstoneCursor {
  bucket: string
  path: string
}

/**
 * Las funciones de la base que aplican los plazos de conservación (migración 0284). Primero la base
 * (referencia fuera y lápida, en una transacción); Storage se borra después desde la lápida.
 */
export interface DataRetentionRepository {
  /** Purga o anonimiza un lote vencido de la categoría. Devuelve cuántas filas tocó (0 a `limit`). */
  purgeBatch(category: BatchCategory, limit: number): Promise<number>
  /** Filas vencidas en orden de id, solo las que vienen DESPUÉS de `afterId`. Como mucho `limit`. */
  listDueFileRows(category: FileCategory, limit: number, afterId?: string): Promise<DueFileRow[]>
  /** Revalida la fila bloqueada y, si sigue vencida, la anonimiza y deja la lápida de su imagen. */
  applyFileRow(category: FileCategory, rowId: string): Promise<FileRowOutcome>
  /** Lápidas pendientes de borrar en Storage, en orden estable, solo las que vienen DESPUÉS del cursor. */
  listPendingTombstones(limit: number, after?: TombstoneCursor): Promise<PendingTombstone[]>
  /** Marca la lápida como borrada, después de que Storage confirmó (o el objeto ya no existía). */
  markTombstoneDeleted(bucket: string, path: string): Promise<void>
}
