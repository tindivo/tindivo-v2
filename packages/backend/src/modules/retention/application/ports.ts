/** Un archivo de Storage que pertenece a una cuenta borrada. */
export interface ProofObject {
  bucket: string
  path: string
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
  /** Cuentas borradas hace más del plazo de `app_settings.account_deletion` y sin purgar. Como mucho `limit` (1 a 100). */
  listDueAccounts(limit: number): Promise<string[]>
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
