import { z } from 'zod'

/**
 * Interruptores de funciones de las apps nativas (estándar CLI-4 y OPS-6).
 *
 * Viven en `app_settings.client_features` y salen en `GET /api/v1/config`.
 *
 * Semántica:
 *  · Una función nueva y arriesgada de las apps nativas se DECLARA aquí por
 *    migración: la clave la crea un desarrollador, no el admin (el admin solo
 *    cambia `enabled` y `message` de las claves que ya existen).
 *  · `enabled: false` es el kill switch: la app deja de ofrecer la función y
 *    muestra `message` en su lugar.
 *  · Una clave que la app no encuentra en la respuesta significa «usa tu valor
 *    por defecto compilado»: nunca se interpreta como apagada.
 */

/** Minúsculas, dígitos y guion bajo; empieza con letra. */
export const FeatureKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,40}$/, 'Clave inválida (minúsculas, dígitos y _; 2 a 41 caracteres)')

export const ClientFeatureSchema = z.object({
  enabled: z.boolean(),
  /** Texto que la app muestra cuando la función está apagada. */
  message: z.string().min(1).max(140).optional(),
})
export type ClientFeature = z.infer<typeof ClientFeatureSchema>

export const ClientFeaturesMapSchema = z.record(FeatureKeySchema, ClientFeatureSchema)
export type ClientFeaturesMap = z.infer<typeof ClientFeaturesMapSchema>

/** Forma de `app_settings.client_features`. */
export const ClientFeaturesSettingsSchema = z.object({ features: ClientFeaturesMapSchema })
export type ClientFeaturesSettings = z.infer<typeof ClientFeaturesSettingsSchema>
