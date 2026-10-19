import { createServiceRoleClient, type TypedSupabaseClient } from '@tindivo/supabase'
import { type Authenticator, SupabaseAuthenticator } from '../modules/identity'
import {
  type Clock,
  createLogger,
  type IdGenerator,
  type Logger,
  randomIdGenerator,
  systemClock,
} from '../shared'

/** Lo que el desplegable entrega una vez, ya validado (el paquete no lee `process.env`). */
export interface BackendConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
}

/** Dependencias de un handler, armadas en la raíz de composición. */
export interface Deps {
  auth: Authenticator
  clock: Clock
  ids: IdGenerator
  logger: Logger
  /** Cliente service-role (salta RLS): se crea la primera vez que se pide. */
  supabase: () => TypedSupabaseClient
}

let config: BackendConfig | null = null
let deps: Deps | null = null

/** Lo llama el desplegable al arrancar. Volver a llamarla descarta las dependencias ya armadas. */
export function configureBackend(next: BackendConfig): void {
  config = next
  deps = null
}

/** Dependencias reales, creadas la primera vez que se piden. */
export function getDeps(): Deps {
  if (deps) return deps
  if (!config) {
    throw new Error(
      'El backend no está configurado: el desplegable debe llamar a configureBackend() antes de atender peticiones',
    )
  }
  const { supabaseUrl, supabaseServiceRoleKey } = config
  let client: TypedSupabaseClient | null = null
  const supabase = () => {
    client ??= createServiceRoleClient(supabaseUrl, supabaseServiceRoleKey)
    return client
  }
  deps = {
    auth: new SupabaseAuthenticator(supabase),
    clock: systemClock,
    ids: randomIdGenerator,
    logger: createLogger({ module: 'backend' }),
    supabase,
  }
  return deps
}
