import type { ClientApp, PushDevice, PushDeviceRegistration, UserRole } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import type { Actor } from '../../identity'
import type { DeviceRepository } from './ports'

/** El rol que debe tener la sesión para registrar el dispositivo de cada app. */
const ROLE_OF_APP: Record<ClientApp, UserRole> = {
  customer: 'customer',
  negocios: 'business',
  motorizados: 'driver',
}

export interface RegisterDeviceInput {
  actor: Actor
  installId: string
  registration: PushDeviceRegistration
}

/** Registra el dispositivo del actor. La identidad sale de la sesión; el rol, de la app (API-7). */
export async function registerDevice(
  deps: { devices: DeviceRepository },
  { actor, installId, registration }: RegisterDeviceInput,
): Promise<PushDevice> {
  if (!actor.roles.includes(ROLE_OF_APP[registration.app])) {
    throw new DomainError('Esta cuenta no puede registrar dispositivos de esa app', 'forbidden')
  }
  return deps.devices.register({
    actorUserId: actor.userId,
    installId,
    platform: registration.platform,
    app: registration.app,
    token: registration.token,
    environment: registration.environment,
    appVersion: registration.appVersion,
    osVersion: registration.osVersion ?? null,
    deviceModel: registration.deviceModel ?? null,
    locale: registration.locale ?? null,
    timezone: registration.timezone ?? null,
    notificationsEnabled: registration.notificationsEnabled,
  })
}
