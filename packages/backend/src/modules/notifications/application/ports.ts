import type { ClientApp, NativePlatform, PushDevice } from '@tindivo/contracts'

/** Lo que la app manda al registrar su instalación, más el actor ya verificado. */
export interface DeviceRegistration {
  actorUserId: string
  installId: string
  platform: NativePlatform
  app: ClientApp
  token: string
  environment: 'production' | 'sandbox'
  appVersion: string
  osVersion: string | null
  deviceModel: string | null
  locale: string | null
  timezone: string | null
  notificationsEnabled: boolean
}

export interface DeviceRepository {
  /**
   * Registra o actualiza la instalación, de forma atómica (ver la migración 0268). Lanza
   * `DomainError` `unauthorized` si la cuenta fue eliminada. Nunca devuelve el token.
   */
  register(input: DeviceRegistration): Promise<PushDevice>
  /** Borra la instalación solo si es del actor. `false` si no existía o era de otro. */
  unregister(actorUserId: string, installId: string): Promise<boolean>
}
