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
  commissions: z.object({ near: money, far: money, pickup: money }),
  delivery_bands: z.object({ near: money, far: money }),
  prepay_threshold: z.number().positive().max(10000),
  validation: z.object({ amountThreshold: money }),
  support_whatsapp: z.string().trim().min(7).max(20),
  support_phone: z.string().trim().min(7).max(20),
  timers: z.object({
    acceptanceMinutes: minutes,
    validationMinutes: minutes,
    prepayVerificationMinutes: minutes,
    prepExtensionMinutes: minutes,
    maxPrepExtensions: z.number().int().nonnegative().max(10),
    noShowWaitMinutes: minutes,
    cashAutoConfirmHours: z.number().int().positive().max(168),
  }),
  platform_schedule: z.object({
    days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).max(7),
    startHHMM: hhmm,
    endHHMM: hhmm,
  }),
}

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
    const value = validator.parse(body.value) as AppSettingValue
    const service = createServiceClient()
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
