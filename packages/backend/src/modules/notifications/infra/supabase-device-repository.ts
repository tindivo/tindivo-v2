import { type PushDevice, PushDeviceSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import type { TypedSupabaseClient } from '@tindivo/supabase'
import type { DeviceRegistration, DeviceRepository } from '../application/ports'

/** Postgres devuelve `timestamptz` con offset; la API manda siempre UTC con `Z` (API-8). */
function toUtcIso(value: string): string {
  return new Date(value).toISOString()
}

/**
 * Llama a `register_push_device` y `unregister_push_device` (migración 0268) con el cliente
 * service-role. Único sitio de este módulo que conoce el SDK (DES-2).
 */
export class SupabaseDeviceRepository implements DeviceRepository {
  constructor(private readonly supabase: () => TypedSupabaseClient) {}

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
    const { data, error } = await this.supabase().rpc('register_push_device', args)
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
    const { data, error } = await this.supabase().rpc('unregister_push_device', {
      p_actor_user_id: actorUserId,
      p_install_id: installId,
    })
    if (error) throw new Error(`No se pudo dar de baja el dispositivo: ${error.message}`)
    return data
  }
}
