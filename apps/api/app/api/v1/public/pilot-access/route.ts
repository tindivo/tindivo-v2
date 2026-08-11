import { isPilotActive, PhonePeSchema } from '@tindivo/contracts'
import { z } from 'zod'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { isPhoneAllowed } from '@/lib/pilot/gate'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const PilotAccessSchema = z.object({
  phone: PhonePeSchema,
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * POST /public/pilot-access — ¿este número está invitado al piloto?
 *
 * Lo consume el muro de la portada: el vecino teclea su celular y, si está en
 * `pilot_whitelist`, el muro se levanta en ese dispositivo. Público a propósito:
 * el muro se le muestra a quien todavía no ha iniciado sesión.
 *
 * QUÉ REVELA Y POR QUÉ SE ACEPTA
 * Responde un booleano por número, así que en teoría permite preguntar «¿está
 * invitado el 9XXXXXXXX?». Se asume el riesgo porque lo que devuelve no abre
 * ninguna puerta: levantar el muro es cosmético —vive en `localStorage` y
 * cualquiera lo salta con las devtools— y PEDIR sigue exigiendo pasar los gates
 * de `send-code` y `customer/orders`, que se enforcean sobre el teléfono
 * VERIFICADO por OTP, no sobre lo que alguien teclee aquí.
 *
 * Pasado PILOT_LAUNCH_AT responde `allowed: true` a todo sin tocar la tabla.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { phone } = PilotAccessSchema.parse(await req.json())
    const service = createServiceClient()
    const allowed = await isPhoneAllowed(service, phone)
    return ok({ allowed, pilotActive: isPilotActive() }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
