import { type PushDevice, PushDeviceSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import type { TypedSupabaseClient } from '@tindivo/supabase'
import type { DeviceRegistration, DeviceRepository } from '../application/ports'

/** Postgres devuelve `timestamptz` con offset; la API manda siempre UTC con `Z` (API-8). */
function toUtcIso(value: string): string {
  return new Date(value).toISOString()
}

/**
 * SQLSTATE con que PostgreSQL aborta una transacción por una carrera sin corromper nada:
 * `40P01` (deadlock detectado) y `40001` (fallo de serialización). Dos registros que se
 * cruzan los tokens se borran la fila el uno al otro y la base aborta uno; reintentar la
 * MISMA transacción es lo correcto.
 */
const RETRYABLE_SQLSTATE = new Set(['40P01', '40001'])

const isRetryable = (error: { code?: string | null } | null): boolean =>
  !!error?.code && RETRYABLE_SQLSTATE.has(error.code)

export interface RepositoryOptions {
  /** Intentos en total (3 por defecto). */
  attempts?: number
  /** Espera base entre intentos en ms (80 por defecto); crece al doble y lleva algo de azar. */
  baseDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Llama a `register_push_device` y `unregister_push_device` (migración 0268) con el cliente
 * service-role. Único sitio de este módulo que conoce el SDK (DES-2).
 */
export class SupabaseDeviceRepository implements DeviceRepository {
  private readonly attempts: number
  private readonly baseDelayMs: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(
    private readonly supabase: () => TypedSupabaseClient,
    options: RepositoryOptions = {},
  ) {
    this.attempts = options.attempts ?? 3
    this.baseDelayMs = options.baseDelayMs ?? 80
    this.sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  }

  /** Reintenta ante deadlock o fallo de serialización; agotados los intentos, 409 y nunca 500. */
  private async withTxRetry<T extends { error: { code?: string | null } | null }>(
    run: () => PromiseLike<T>,
  ): Promise<T> {
    let result = await run()
    for (let n = 1; n < this.attempts && isRetryable(result.error); n++) {
      const jitter = Math.floor(Math.random() * this.baseDelayMs)
      await this.sleep(this.baseDelayMs * 2 ** (n - 1) + jitter)
      result = await run()
    }
    if (isRetryable(result.error)) {
      throw new DomainError('Registro en conflicto, reintenta', 'conflict')
    }
    return result
  }

  async register(input: DeviceRegistration): Promise<PushDevice> {
    // Sin defaults en la función, PostgREST exige todos los argumentos: los cuatro textos
    // opcionales viajan como `null`, aunque el generador de tipos los declara `string`.
    const args = {
      p_actor_user_id: input.actorUserId,
      p_install_id: input.installId,
      p_platform: input.platform,
      p_app: input.app,
      p_token: input.token,
      p_environment: input.environment,
      p_app_version: input.appVersion,
      p_os_version: input.osVersion as string,
      p_device_model: input.deviceModel as string,
      p_locale: input.locale as string,
      p_timezone: input.timezone as string,
      p_notifications_enabled: input.notificationsEnabled,
    }
    const { data, error } = await this.withTxRetry(() =>
      this.supabase().rpc('register_push_device', args),
    )
    if (error) {
      if (error.code === 'P0001' && error.message === 'account_deleted') {
        throw new DomainError('Esta cuenta fue eliminada', 'unauthorized')
      }
      if (error.code === 'P0001' && error.message === 'install_id_taken') {
        throw new DomainError('Esta instalación pertenece a otra cuenta', 'conflict')
      }
      throw new Error(`No se pudo registrar el dispositivo: ${error.message}`)
    }
    return PushDeviceSchema.parse({
      installId: data.install_id,
      platform: data.platform,
      app: data.app,
      notificationsEnabled: data.notifications_enabled,
      registeredAt: toUtcIso(data.created_at),
      updatedAt: toUtcIso(data.updated_at),
    })
  }

  async unregister(actorUserId: string, installId: string): Promise<boolean> {
    const { data, error } = await this.withTxRetry(() =>
      this.supabase().rpc('unregister_push_device', {
        p_actor_user_id: actorUserId,
        p_install_id: installId,
      }),
    )
    if (error) throw new Error(`No se pudo dar de baja el dispositivo: ${error.message}`)
    return data
  }
}
