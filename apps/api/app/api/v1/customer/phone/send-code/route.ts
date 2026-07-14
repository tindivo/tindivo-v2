import { PhonePeSchema } from '@tindivo/contracts'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'
import { VERIFY_SERVICE_SID, twilioClient } from '@/lib/twilio/client'
import { z } from 'zod'

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
    const service = createServiceClient()
    const { count } = await service.from('customer_otp_attempts')
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
