import { z } from 'zod'
import { BUSINESS_PRIMARY_CAPABILITIES } from '../enums'
import { legacyMoney, openEnum, uuidOut } from './schema-helpers'

/**
 * Respuestas de las rutas públicas, descritas TAL COMO SON HOY (lote MV2a).
 * Cada forma sale de la ruta y de la definición viva de su función SQL en
 * tindivo-prod (leída el 2026-10-09). Si una ruta cambia su respuesta, este
 * esquema cambia en el mismo commit y el diff del OpenAPI lo enseña.
 */

/** GET /health */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('tindivo-api'),
  version: z.literal('v1'),
  time: z.string().meta({ description: 'ISO 8601, UTC' }),
})

/**
 * GET /public/schedule — `get_order_intake_status()`.
 *
 * La ruta tiene un respaldo para cuando la función falla, y ese respaldo NO
 * tiene la misma forma: no trae `startTime` y manda `serverTimeLima` como ISO en
 * UTC, mientras que la función lo manda como «YYYY-MM-DD HH:MM:SS» en hora de
 * Lima. Se documenta la unión de los dos; corregirlo es un cambio aparte.
 */
export const ScheduleStatusSchema = z.object({
  isOpen: z.boolean(),
  cutoff: z.string().meta({ description: 'Hora de cierre de la recepción, HH:MM en Lima' }),
  startTime: z.string().optional().meta({
    description: 'Hora de apertura, HH:MM en Lima. Falta cuando responde el respaldo de la ruta',
  }),
  serverTimeLima: z.string().meta({
    description:
      'Hora del servidor. Normalmente «YYYY-MM-DD HH:MM:SS» en Lima; en el respaldo, ISO 8601 en UTC',
  }),
  message: z.string().nullable(),
})

/** GET /public/courier/status — `courier_service_status()`, sin envoltura. */
export const CourierServiceStatusSchema = z.object({
  enabled: z.boolean(),
  openNow: z.boolean(),
  hours: z
    .object({
      start: z.string().meta({ description: 'HH:MM en Lima' }),
      end: z.string().meta({ description: 'HH:MM en Lima' }),
      days: z.array(z.number().int()).meta({ description: 'Días ISO: 1 = lunes … 7 = domingo' }),
    })
    .nullable()
    .meta({ description: 'Tal cual `app_settings.courier.hours`. Null en el respaldo de la ruta' }),
  price: legacyMoney,
  pausedMessage: z.string().nullable(),
})

/** GET /public/search — `search_catalog()`. */
export const SearchCatalogResponseSchema = z.object({
  businesses: z.array(
    z.object({
      id: uuidOut,
      slug: z.string(),
      name: z.string(),
      tagline: z.string().nullable(),
      accent_color: z.string(),
      logo_url: z.string().nullable(),
      primary_capability: openEnum(BUSINESS_PRIMARY_CAPABILITIES).nullable(),
      estimated_eta_min: z.number().int(),
      estimated_eta_max: z.number().int(),
    }),
  ),
  items: z.array(
    z.object({
      id: uuidOut,
      business_id: uuidOut,
      business_slug: z.string(),
      business_name: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      base_price: legacyMoney,
      image_url: z.string().nullable(),
      image_hue: z.number().int().nullable(),
    }),
  ),
})

export const SearchCatalogQuerySchema = z.object({
  q: z.string().trim().min(2).max(60).meta({ description: 'Texto a buscar en negocios y platos' }),
})

/** POST /public/pilot-access — hoy responde siempre lo mismo (el piloto cerrado terminó). */
export const PilotAccessResponseSchema = z.object({
  allowed: z.boolean(),
  pilotActive: z.boolean(),
})
