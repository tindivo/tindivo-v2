import { PhonePeSchema } from '@tindivo/contracts'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
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
 * Envía un código OTP vía Twilio Verify por SMS.
 * Rate limit: 3 intentos por usuario en las últimas 24 horas.
 *
 * SMS Y SOLO SMS, aunque el canal caro sea ese. Aquí ponía "WhatsApp primario,
 * SMS fallback" y la llamada siempre ha dicho `channel: 'sms'`: el comentario
 * describía una intención, no el código. El canal de WhatsApp de Twilio Verify
 * exige un remitente de WhatsApp aprobado —trámite aparte, no basta con tener
 * cuenta—, así que hoy no está disponible.
 *
 * Importa dejarlo escrito porque en San Jacinto no es un detalle: con mala
 * cobertura WhatsApp llega donde el SMS no, y además sale más barato. Si algún
 * día se aprueba el remitente, esto pasa a `channel: 'whatsapp'` con SMS de
 * reserva — y entonces el comentario de antes será verdad.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'customer')
    const { phone } = SendCodeSchema.parse(await req.json())
    const fullPhone = `+51${phone}`

    const service = createServiceClient()

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
    //
    // EL FALLO DE TWILIO NO PUEDE SALIR COMO "error interno" A SECAS. Sin este
    // catch, cualquier rechazo suyo subía al `handleError` de abajo y el vecino
    // leía "Ocurrió un error interno", que no dice nada ni a él ni a quien mira
    // el log. Y los motivos son mundanos y accionables: cuenta de prueba que
    // solo escribe a números verificados, permisos geográficos de Perú sin
    // habilitar, o el servicio Verify mal apuntado. El código de Twilio queda
    // en el log; el vecino recibe algo que puede entender.
    let verification: { channel: string }
    try {
      verification = await twilioClient.verify.v2
        .services(VERIFY_SERVICE_SID)
        .verifications.create({
          to: fullPhone,
          channel: 'sms',
          locale: 'es',
        })
    } catch (twilioErr) {
      const e = twilioErr as { code?: number; status?: number; message?: string }
      // El 60200 de Twilio dice "Invalid parameter" y NO dice cuál, así que el
      // log tiene que enseñar los tres candidatos. El teléfono va entero (es del
      // propio usuario y ya está en la petición); del SID solo el prefijo y el
      // largo, que basta para reconocer un valor equivocado sin filtrarlo.
      console.error(
        `[twilio] verificación rechazada · code=${e.code} status=${e.status} · ${e.message}` +
          ` · to=${fullPhone} channel=sms locale=es` +
          ` · serviceSid=${VERIFY_SERVICE_SID.slice(0, 2)}…(${VERIFY_SERVICE_SID.length})`,
      )
      return problem('internal_error', {
        detail:
          'No pudimos enviarte el SMS. Escríbenos por WhatsApp y te verificamos el número a mano.',
        requestId,
        headers: corsHeaders(req),
      })
    }

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
