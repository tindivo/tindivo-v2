import type { TypedSupabaseClient } from '@tindivo/supabase'
import type { ProofStorage } from '../application/ports'

/** Borra archivos por la API de Storage (borrar filas de `storage.objects` no borra el archivo). */
export class SupabaseProofStorage implements ProofStorage {
  constructor(private readonly supabase: () => TypedSupabaseClient) {}

  async remove(bucket: string, paths: string[]): Promise<void> {
    const { error } = await this.supabase().storage.from(bucket).remove(paths)
    if (error) throw new Error(`No se pudo borrar de Storage: ${error.message}`)
  }
}
