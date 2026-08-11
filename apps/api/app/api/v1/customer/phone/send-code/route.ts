import { PhonePeSchema } from '@tindivo/contracts'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { isPhoneAllowed, PILOT_REJECTION_DETAIL } from '@/lib/pilot/gate'
import { createServiceClient } from '@/lib/supabase/service'
import { twilioClient, VERIFY_SERVICE_SID } from '@/lib/twilio/client'

export const dynamic = 'force-dynamic'

const SendCodeSchema = z.object({
  phone: PhonePeSchema,
})

/** Máximo de intentos de verificación por usuario en una ventana de 24 horas. */
const MAX_ATTEMPTS_PER_24H = 3

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * POST /customer/phone/send-code
 * Envía un código OTP vía Twilio Verify (WhatsApp primario, SMS fallback).
 * Rate limit: 3 intentos por usuario en las últimas 24 horas.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'customer')
    const { phone } = SendCodeSchema.parse(await req.json())
    const fullPhone = `+51${phone}`

    // Gate del piloto cerrado. ANTES de Twilio: un número no invitado no debe
    // quemar un SMS. `phone` ya son los 9 dígitos canónicos de PhonePeSchema,
    // que es justo el formato de `pilot_whitelist`.
    // Pasado PILOT_LAUNCH_AT esto pasa siempre y no consulta la tabla.
    const service = createServiceClient()
    if (!(await isPhoneAllowed(service, phone))) {
      return problem('forbidden', {
        detail: PILOT_REJECTION_DETAIL,
        requestId,
        headers: corsHeaders(req),
      })
    }

    if (!twilioClient) {
      return problem('internal_error', {
        detail: 'Verificación de teléfono no disponible temporalmente.',
        requestId,
        headers: corsHeaders(req),
      })
    }

    // Rate limiting: ventana de 24h (no día calendario) para evitar
    // desfase UTC vs Perú (UTC-5). Un intento a las 7:30pm hora local
    // no debe reiniciar el contador a las 7:00pm (medianoche UTC).
    const { count } = await service
      .from('customer_otp_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if ((count ?? 0) >= MAX_ATTEMPTS_PER_24H) {
      return problem('rate_limited', {
        detail: `Máximo ${MAX_ATTEMPTS_PER_24H} intentos de verificación en 24 horas. Intenta de nuevo más tarde.`,
        requestId,
        headers: corsHeaders(req),
      })
    }

    // Enviar OTP via Twilio Verify (WhatsApp primario, SMS fallback automático).
    const verification = await twilioClient.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verifications.create({
        to: fullPhone,
        channel: 'sms',
        locale: 'es',
      })

    // Registrar intento para rate limiting.
    await service.from('customer_otp_attempts').insert({
      user_id: user.id,
      phone: fullPhone,
    })

    return ok(
      { sent: true, channel: verification.channel },
      { status: 200, headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
