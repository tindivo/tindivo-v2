import { z } from 'zod'
import { CLIENT_APPS, NATIVE_PLATFORMS } from './client-compat'

/**
 * Registro de dispositivos nativos de push (APNs y FCM), `PUT/DELETE /push/devices/{installId}`.
 *
 * Una fila por instalación: `installId` es un UUID que la app genera al instalarse y DEBE
 * regenerarse al cerrar sesión; una instalación de otra cuenta responde 409 `conflict`.
 * El token es una credencial: viaja en el cuerpo del registro y la API nunca lo devuelve.
 * Web Push (`/push/subscriptions`) es otro canal y no cambia.
 */

export const PUSH_ENVIRONMENTS = ['production', 'sandbox'] as const

/** Parámetros de ruta de `PUT` y `DELETE /push/devices/{installId}`. */
export const PushDeviceParamsSchema = z.object({
  installId: z.uuid().meta({
    description:
      'UUID que genera la app al instalarse y DEBE regenerarse al cerrar sesión; una instalación de otra cuenta responde 409 `conflict`',
  }),
})

/** Cuerpo de `PUT /push/devices/{installId}`. La identidad sale del token de sesión. */
export const PushDeviceRegistrationSchema = z.object({
  platform: z.enum(NATIVE_PLATFORMS),
  app: z.enum(CLIENT_APPS).meta({ description: 'La app que registra; debe corresponder a su rol' }),
  token: z.string().min(32).max(4096).meta({ description: 'Token de APNs o de FCM' }),
  environment: z
    .enum(PUSH_ENVIRONMENTS)
    .default('production')
    .meta({ description: '`sandbox` solo para compilaciones de desarrollo de iOS' }),
  appVersion: z.string().min(1).max(64),
  osVersion: z.string().min(1).max(64).optional(),
  deviceModel: z.string().min(1).max(128).optional(),
  locale: z.string().min(1).max(64).optional(),
  timezone: z.string().min(1).max(64).optional(),
  notificationsEnabled: z.boolean().meta({
    description: 'Si el sistema operativo permite avisos a esta app en este momento',
  }),
})
export type PushDeviceRegistration = z.infer<typeof PushDeviceRegistrationSchema>

/** Respuesta de `PUT /push/devices/{installId}`. Sin el token: es una credencial. */
export const PushDeviceSchema = z.object({
  installId: z.uuid(),
  platform: z.enum(NATIVE_PLATFORMS),
  app: z.enum(CLIENT_APPS),
  notificationsEnabled: z.boolean(),
  registeredAt: z.iso.datetime().meta({ description: 'Cuándo se registró esta instalación (UTC)' }),
  updatedAt: z.iso.datetime().meta({ description: 'Último cambio del registro (UTC)' }),
})
export type PushDevice = z.infer<typeof PushDeviceSchema>
