import { DomainError } from '@tindivo/core'
import type { Database } from '@tindivo/supabase'
import { z } from 'zod'

type AppSettingValue = Database['public']['Tables']['app_settings']['Update']['value']

import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)')
const money = z.number().nonnegative().max(1000)
const minutes = z.number().int().positive().max(1440)

/** Solo estos ajustes son editables desde el panel; cada uno valida su forma. */
const EDITABLE: Record<string, z.ZodTypeAny> = {
  // Desde la migración 0125 `commissions` guarda la comisión SOLA, sin el envío
  // mezclado dentro. Ya no hay clave por banda: `delivery` vale igual para near
  // y para far, y el envío se suma aparte desde `orders.delivery_fee`.
  commissions: z.object({ delivery: money, pickup: money }),
  delivery_bands: z.object({ near: money, far: money }),
  prepay_threshold: z.number().positive().max(10000),
  // Límite de crédito que se le ANUNCIA al negocio en su pantalla de saldo.
  // Es informativo: alcanzarlo no suspende a nadie (la 0178 lo conectó con la
  // suspensión automática y la 0179 lo revirtió). Editable desde el panel para
  // poder mover el cartel sin desplegar.
  debt_block_threshold: z.number().positive().max(100000),
  validation: z.object({ amountThreshold: money }),
  support_whatsapp: z.string().trim().min(7).max(20),
  timers: z.object({
    acceptanceMinutes: minutes,
    validationMinutes: minutes,
    prepayVerificationMinutes: minutes,
    prepExtensionMinutes: minutes,
    maxPrepExtensions: z.number().int().nonnegative().max(10),
    noShowWaitMinutes: minutes,
    transferTtlSeconds: z.number().int().min(5).max(300),
  }),
  platform_schedule: z.object({
    days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).max(7),
    startHHMM: hhmm,
    endHHMM: hhmm,
  }),
  // Polígono de cobertura (San Jacinto). El admin lo dibuja con Leaflet-draw; el
  // cliente lo lee para restringir la selección de dirección (point-in-polygon).
  coverage_polygon: z.object({
    polygon: z
      .array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }))
      .min(3)
      .max(200),
  }),
}

/**
 * Ajustes cuyo objeto en la BD tiene MÁS claves que las que edita el panel: el
 * PATCH fusiona sobre el valor actual en vez de reemplazarlo. `timers` guarda
 * cuatro claves que el formulario no envía (`paymentMinutes`,
 * `queueLeadMinutes`, `travelMinutesMin`, `travelMinutesMax`) y, como
 * `z.object` descarta lo desconocido, un "Guardar tiempos" las borraba.
 */
const MERGED_KEYS = new Set(['timers'])

const PatchSchema = z.object({ key: z.string(), value: z.unknown() })

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Devuelve todos los ajustes de la plataforma (admin). */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const service = createServiceClient()
    const { data, error } = await service.from('app_settings').select('key,value,updated_at')
    if (error) throw new Error(error.message)
    return ok(data ?? [], { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Actualiza un ajuste de la lista blanca, validando su forma. */
export async function PATCH(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const body = PatchSchema.parse(await req.json())
    const validator = EDITABLE[body.key]
    if (!validator) throw new DomainError('Ese ajuste no es editable', 'forbidden')
    const parsed = validator.parse(body.value)
    const service = createServiceClient()
    let value = parsed as AppSettingValue
    if (MERGED_KEYS.has(body.key)) {
      const { data: current, error: readError } = await service
        .from('app_settings')
        .select('value')
        .eq('key', body.key)
        .single()
      if (readError) throw new Error(readError.message)
      const base = (current.value ?? {}) as Record<string, unknown>
      value = { ...base, ...(parsed as Record<string, unknown>) } as AppSettingValue
    }
    const { data, error } = await service
      .from('app_settings')
      .update({ value, updated_by: user.id })
      .eq('key', body.key)
      .select('key,value,updated_at')
      .single()
    if (error) throw new Error(error.message)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
