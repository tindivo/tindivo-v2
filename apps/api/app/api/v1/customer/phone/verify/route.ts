import { PhonePeSchema } from '@tindivo/contracts'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'
import { twilioClient, VERIFY_SERVICE_SID } from '@/lib/twilio/client'

export const dynamic = 'force-dynamic'

const VerifySchema = z.object({
  phone: PhonePeSchema,
  code: z.string().length(6, 'El código debe tener 6 dígitos'),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * POST /customer/phone/verify
 * Verifica el código OTP recibido contra Twilio Verify.
 * Si es válido, marca el teléfono como verificado en customer_profiles.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'customer')
    const { phone, code } = VerifySchema.parse(await req.json())
    const fullPhone = `+51${phone}`

    if (!twilioClient) {
      return problem('internal_error', {
        detail: 'Verificación de teléfono no disponible temporalmente.',
        requestId,
        headers: corsHeaders(req),
      })
    }

    // Twilio Verify Check: el SDK lanza excepción (HTTP 404/400) cuando el
    // código expiró o es inválido. Envolvemos en try/catch específico para
    // devolver un 400 controlado en vez de un 500 genérico.
    let check: { status: string }
    try {
      const result = await twilioClient.verify.v2
        .services(VERIFY_SERVICE_SID)
        .verificationChecks.create({
          to: fullPhone,
          code,
        })
      check = result
    } catch (twilioError) {
      // Código incorrecto, expirado, o teléfono no tiene verificación pendiente.
      return problem('validation_error', {
        detail: 'Código incorrecto o expirado. Solicita uno nuevo.',
        requestId,
        headers: corsHeaders(req),
      })
    }

    if (check.status !== 'approved') {
      return problem('validation_error', {
        detail: 'Código incorrecto o expirado. Solicita uno nuevo.',
        requestId,
        headers: corsHeaders(req),
      })
    }

    // Éxito: actualizar phone (E.164) + phone_verified_at.
    // Guardamos en formato internacional (+519XXXXXXXX) para
    // compatibilidad futura con pasarelas de pago y WhatsApp Business API.
    const service = createServiceClient()
    const { error } = await service
      .from('customer_profiles')
      .update({
        phone: fullPhone,
        phone_verified_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    if (error) {
      if (error.code === '23505') {
        return problem('conflict', {
          detail: 'Este número ya está asociado a otra cuenta.',
          requestId,
          headers: corsHeaders(req),
        })
      }
      throw new Error(error.message)
    }

    return ok({ verified: true, phone: fullPhone }, { status: 200, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
