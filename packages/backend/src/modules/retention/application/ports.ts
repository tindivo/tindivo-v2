/** Un archivo de Storage que pertenece a una cuenta borrada. */
export interface ProofObject {
  bucket: string
  path: string
}

/** Una cuenta vencida y su posición en el orden estable de la lista (`deletedAt` tal como lo da la base). */
export interface DueAccount {
  userId: string
  deletedAt: string
}

/** Posición desde la que sigue la lista: la última cuenta ya vista. */
export type DueCursor = DueAccount

/** Por qué la base se negó a cerrar una purga (mensajes de `finish_proof_purge`, migración 0269). */
export const PURGE_ABORT_REASONS = [
  'not_due',
  'proof_objects_remain',
  'non_canonical_refs',
  'user_not_found',
] as const
export type PurgeAbortReason = (typeof PURGE_ABORT_REASONS)[number]

/** `finishPurge` la lanza cuando la base aborta por una razón de negocio: la cuenta queda pendiente. */
export class PurgeAbortedError extends Error {
  constructor(readonly reason: PurgeAbortReason) {
    super(`purge_aborted:${reason}`)
    this.name = 'PurgeAbortedError'
  }
}

/** Lo que dejó `finish_proof_purge` (migración 0269). */
export interface PurgeOutcome {
  status: 'purged' | 'already_purged'
  /** Pedidos a los que se les quitó `comprobante_prepago_url`. */
  orders: number
  /** Reportes a los que se les quitó `evidence_url`. */
  reports: number
}

/** Las tres funciones de la base que reparten el trabajo de la purga (migración 0269). */
export interface RetentionRepository {
  /**
   * Cuentas borradas hace más del plazo de `app_settings.account_deletion` y sin purgar, en orden
   * `(deletedAt, userId)` y solo las que vienen DESPUÉS del cursor. Como mucho `limit` (1 a 100).
   */
  listDueAccounts(limit: number, after?: DueCursor): Promise<DueAccount[]>
  /** Objetos de la cuenta en `payment-proofs` y `receipts`. */
  listProofObjects(userId: string): Promise<ProofObject[]>
  /**
   * Quita las referencias y marca la cuenta como purgada. La base aborta si la cuenta no
   * venció o si aún quedan objetos en Storage.
   */
  finishPurge(userId: string): Promise<PurgeOutcome>
}

export interface ProofStorage {
  /** Borra los archivos de un bucket. Lanza si Storage devuelve un error. */
  remove(bucket: string, paths: string[]): Promise<void>
}
