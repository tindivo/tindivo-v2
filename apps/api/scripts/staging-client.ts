/**
 * Único camino para obtener un cliente de staging con service role.
 *
 * La validación del destino (`assertStagingTarget`) y la creación del cliente son inseparables:
 * `createStagingClient` valida y solo entonces crea, y registra el cliente en un `WeakSet` privado.
 * Toda función que escriba (`seedStagingCatalog`) llama a `assertVerifiedStagingClient` antes de
 * su primera petición, así que un cliente armado a mano (producción u otra base) se rechaza.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertStagingTarget, STAGING_ORIGIN, STAGING_SERVICE_KEY_SHA256 } from './staging-target.ts'

// biome-ignore lint/suspicious/noExplicitAny: las semillas escriben tablas por nombre dinámico, sin tipar filas
export type StagingClient = SupabaseClient<any, any, any>

const verified = new WeakSet<object>()

export function createStagingClient(
  url: string,
  serviceKey: string,
  expectedKeySha256: string = STAGING_SERVICE_KEY_SHA256,
): StagingClient {
  assertStagingTarget(url, serviceKey, expectedKeySha256)
  const client = createClient(STAGING_ORIGIN, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as StagingClient
  verified.add(client)
  return client
}

export function assertVerifiedStagingClient(db: object): void {
  if (!verified.has(db)) {
    throw new Error(
      'ABORTADO: el cliente no es un cliente de staging verificado (usa createStagingClient).',
    )
  }
}
